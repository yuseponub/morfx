---
phase: standalone-debounce-interruption-system-v2
plan: 06
type: execute
wave: 5
depends_on: [01, 02, 04, 05]
files_modified:
  - src/inngest/functions/v2-lock-cleanup-cron.ts
  - src/app/api/inngest/route.ts
  - src/app/api/observability/events/route.ts
  - src/lib/sandbox/types.ts
  - src/app/(dashboard)/sandbox/components/debug-panel/tab-bar.tsx
  - src/app/(dashboard)/sandbox/components/debug-panel/interruption-tab.tsx
  - src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx
autonomous: true
requirements:
  - LOCK-06  # Inngest cron cleanup orphaned locks every 5min (D-09 layer 3)
  - LOCK-08  # Sandbox debug-panel tab "Interruption"

must_haves:
  truths:
    - "Inngest cron `v2-lock-cleanup-cron` runs every 5 minutes (cron expression `TZ=America/Bogota */5 * * * *`) and sweeps `lock:*` keys via SCAN."
    - "REVISION B1 + D-09 verbatim: The cron compares each found lock against the `agent_sessions` table where `status = 'active'` (per actual schema — verified during revision; D-09 references 'agent_sessions activas' which our schema represents as `status='active'`, NOT `ended_at IS NULL`). For locks whose `(workspaceId, channel, identifier)` does NOT correspond to an active session, DELs the lock AND emits the NEW 14th event `lock_orphan_swept_by_cron`."
    - "Defense-in-depth: even if a lock's session is active, ALSO check age — if the lock's `started_at` is older than `MAX_TURN_AGE_S = 60s` (real turns rarely exceed 30s), sweep it (covers the case where the runner's try/finally silently bypassed)."
    - "REVISION B2: Plan 06 `depends_on` is `[01, 02, 04, 05]` because the sandbox tab in Task 6.2 fetches the 13+1=14 typed events emitted by code shipped in Plans 04 (CKPT-0/6/7 + lock_released_normal + zombie_lambda_exit + pending_list_combined + path A/B) and 05 (CKPT-1..5 + interrupt_detected_at_ckpt_N). Wave 5 parallelism with Plan 05 is preserved (no file overlap), but merge ordering is now explicit."
    - "Plan 01 Task 1.3 LockEventLabel union is extended to 14 entries (was 13) to include the NEW `lock_orphan_swept_by_cron` event. The revision-mode planner-revision instruction updates LOCK-07 acceptance criteria from '13 typed events' to '14 typed events'. D-17 coverage matrix in DISCUSSION-LOG.md is updated accordingly in Plan 01's SUMMARY."
    - "The cron is registered in `src/app/api/inngest/route.ts` so it actually fires."
    - "WARNING 5: `src/app/api/observability/events/route.ts` is added to `files_modified` because Task 6.2 step 5 either CREATES this file (if missing) or MODIFIES it (if present) to support the `labels` filter the sandbox tab uses."
    - "Sandbox `DebugPanelTabId` union extended with `'interruption'` value; `TAB_ICONS` Record is exhaustively keyed (TypeScript catches missing entries — anti-Pitfall 6 from v4-subloop-debug-view LEARNING)."
    - "New `interruption-tab.tsx` component fetches the 14 D-17-extended events for the selected session+turn from `agent_observability_events` (post-turn fetch per RESEARCH Open Question 3 — NO live SSE) and renders a lifecycle timeline."
    - "Tab visible in the sandbox debug panel; clicking shows lock acquire/release timestamps, pending list size, checkpoint hits, abort point (if any), combo result (if any)."
  artifacts:
    - path: "src/inngest/functions/v2-lock-cleanup-cron.ts"
      provides: "Inngest function with cron schedule + sweep logic that compares against agent_sessions.status='active' (REVISION B1 + D-09 verbatim)"
      contains: "agent_sessions"
    - path: "src/app/api/inngest/route.ts"
      provides: "v2LockCleanupCron registered in functions array"
      contains: "v2LockCleanupCron"
    - path: "src/app/api/observability/events/route.ts"
      provides: "GET route filtering by session_id/conversation_id/labels — created NEW if missing, MODIFIED if present (WARNING 5)"
      contains: "agent_observability_events"
    - path: "src/app/(dashboard)/sandbox/components/debug-panel/interruption-tab.tsx"
      provides: "React component fetching + rendering the 14 D-17-extended events for a turn"
      contains: "interruption"
    - path: "src/lib/sandbox/types.ts"
      provides: "DebugPanelTabId union extended with 'interruption'"
      contains: "interruption"
    - path: "src/app/(dashboard)/sandbox/components/debug-panel/tab-bar.tsx"
      provides: "TAB_ICONS Record exhaustively includes 'interruption' entry (Lock icon)"
      contains: "interruption"
    - path: "src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx"
      provides: "Wire the new tab into the panel container"
      contains: "InterruptionTab"
  key_links:
    - from: "src/inngest/functions/v2-lock-cleanup-cron.ts"
      to: "src/lib/agents/interruption-system-v2/redis-client.ts + Supabase agent_sessions table"
      via: "redis.scan('lock:*') + supabase.from('agent_sessions').select().eq('status', 'active') + DEL orphans + emitLockEvent('lock_orphan_swept_by_cron', ...)"
      pattern: "agent_sessions"
    - from: "src/app/(dashboard)/sandbox/components/debug-panel/interruption-tab.tsx"
      to: "src/app/api/observability/events/route.ts"
      via: "fetch('/api/observability/events?session_id=...&labels=...') filtered by agent_observability_events category='pipeline_decision' AND label IN (14 D-17-extended labels)"
      pattern: "pipeline_decision"
---

<objective>
Wave 5 (parallel with Plan 05) — Operational tooling: an Inngest cron that sweeps orphaned locks every 5 minutes (D-09 layer 3) and a sandbox debug panel tab that visualizes the lock lifecycle for a selected turn (D-11 + LOCK-08).

REVISION B1 + D-09 verbatim: the cron implements the D-09 design literally — it queries `agent_sessions` (the schema uses `status='active'`, NOT `ended_at IS NULL` — confirmed during revision) and compares lock keys against active sessions. Locks WITHOUT a corresponding active session are swept and emit the NEW 14th event `lock_orphan_swept_by_cron`. Plan 01 Task 1.3 LockEventLabel union is bumped from 13 to 14 entries.

REVISION B2: Plan 06 `depends_on` extended to `[01, 02, 04, 05]` so merge order is explicit — the sandbox tab fetches events emitted by code shipped in Plans 04+05.

REVISION W5: `src/app/api/observability/events/route.ts` listed in `files_modified` (Task 6.2 step 5 creates-if-missing / modifies-if-present).

Purpose: the cron is the safety net for the rare case where heartbeat fails AND finally never runs (e.g., Vercel lambda was killed by OOM/timeout outside try/finally). The sandbox tab is for D-19 Fase 4 confirmation visual — without it, the user has no way to inspect locks beyond raw DB queries.

Output: 7 files (was 6; +1 for observability events route per WARNING 5). After this plan, the cron is live (deploys on next push) and the sandbox `/sandbox` page shows a new "Interruption" tab next to Sub-Loop.
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
<!-- From Plan 01+02 (with REVISION B1 14-event union extension) -->
From src/lib/agents/interruption-system-v2/:
```typescript
// redis-client.ts
export const redis: Redis  // for SCAN/KEYS sweep

// observability.ts (Plan 01 Task 1.3 — REVISED to 14 labels including lock_orphan_swept_by_cron)
export type LockEventLabel =
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
  | 'lock_orphan_swept_by_cron'  // REVISION B1 — NEW 14th label emitted by Plan 06 cron
```

<!-- agent_sessions schema (verified during revision — supabase/migrations/20260205000000_agent_sessions.sql:11) -->
agent_sessions table columns:
- id UUID PRIMARY KEY
- agent_id TEXT NOT NULL
- conversation_id UUID NOT NULL REFERENCES conversations(id)
- contact_id UUID NOT NULL REFERENCES contacts(id)
- workspace_id UUID NOT NULL REFERENCES workspaces(id)
- status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'closed', 'handed_off'))
- created_at TIMESTAMPTZ NOT NULL
- last_activity_at TIMESTAMPTZ NOT NULL
- (NO `ended_at` column — D-09 says "agent_sessions activas" which maps to status='active')

<!-- conversations schema (joins agent_sessions to lock key shape) -->
conversations columns (joinable on agent_sessions.conversation_id):
- id UUID
- workspace_id UUID
- channel TEXT NOT NULL ('whatsapp' | 'facebook' | 'instagram')
- phone TEXT  (WhatsApp identifier — supabase/migrations/20260130000002_whatsapp_conversations.sql:17)
- external_subscriber_id TEXT  (FB/IG identifier — supabase/migrations/20260317000000_add_channel_to_conversations.sql:13)

<!-- Inngest cron pattern template -->
From src/inngest/functions/crm-mutation-idempotency-cleanup.ts:
```typescript
export const crmMutationIdempotencyCleanupCron = inngest.createFunction(
  { id: 'crm-mutation-idempotency-cleanup', name: '...', retries: 1 },
  { cron: 'TZ=America/Bogota 0 3 * * *' },
  async ({ step }) => {
    const result = await step.run('prune-old-keys', () => pruneIdempotencyRows(30))
    return result
  },
)
```

<!-- Sandbox tab pattern from v4-subloop-debug-view LEARNINGS (2026-05-13) -->
From src/lib/sandbox/types.ts line 357:
```typescript
export type DebugPanelTabId = 'pipeline' | 'classify' | 'bloques' | 'tools' | 'state' | 'tokens' | 'ingest' | 'config' | 'subloop'
// EXTEND: add 'interruption'
```

From src/app/(dashboard)/sandbox/components/debug-panel/tab-bar.tsx line 21:
```typescript
const TAB_ICONS: Record<DebugPanelTabId, React.ComponentType<{ className?: string }>> = {
  pipeline: ..., classify: ..., bloques: ..., tools: ..., state: ..., tokens: ..., ingest: ..., config: ..., subloop: ...
  // EXTEND: must add interruption entry — Record<DebugPanelTabId> exhaustive (typecheck-per-commit invariant per LEARNINGS)
}
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 6.1: Create Inngest cron v2-lock-cleanup-cron.ts (D-09 layer 3 + LOCK-06) — REVISION B1: compare against agent_sessions per D-09 verbatim</name>
  <read_first>
    - src/inngest/functions/crm-mutation-idempotency-cleanup.ts (template — exact cron registration pattern)
    - .planning/standalone/debounce-interruption-system-v2/DISCUSSION-LOG.md (D-09 layer 3 verbatim: "Inngest cron cada 5min sweeppea locks 'colgados' comparando con `agent_sessions` activas" — REVISION B1 implements this LITERALLY)
    - .planning/standalone/debounce-interruption-system-v2/RESEARCH.md lines 470-471 (Anti-pattern — NO step.run wrapping; OK to use step.run for atomic sweep loop)
    - supabase/migrations/20260205000000_agent_sessions.sql (verified during revision: status column, NOT ended_at)
    - supabase/migrations/20260317000000_add_channel_to_conversations.sql (verified during revision: channel + external_subscriber_id on conversations table)
    - src/lib/agents/interruption-system-v2/observability.ts (after Plan 01 update — `lock_orphan_swept_by_cron` IS now a typed label per REVISION B1)
  </read_first>
  <action>
    1. Create `src/inngest/functions/v2-lock-cleanup-cron.ts`:
       ```ts
       // ============================================================================
       // Standalone debounce-interruption-system-v2 — D-09 layer 3 + LOCK-06.
       // Sweeps orphaned `lock:*` keys whose owning session is no longer active.
       // Defense against silly bugs (try/finally bypass via OOM kill / lambda timeout).
       // Cron: TZ=America/Bogota */5 * * * *
       //
       // REVISION B1: implements D-09 verbatim — compares against agent_sessions.status='active'.
       // The schema uses `status` (NOT `ended_at`) — verified during revision.
       //
       // Pattern source: crm-mutation-idempotency-cleanup.ts
       // ============================================================================

       import { inngest } from '@/inngest/client'
       import { redis } from '@/lib/agents/interruption-system-v2/redis-client'
       import { emitLockEvent } from '@/lib/agents/interruption-system-v2/observability'
       import { createAdminClient } from '@/lib/supabase/admin'
       import { createModuleLogger } from '@/lib/audit/logger'

       const logger = createModuleLogger('v2-lock-cleanup-cron')

       /** Max age (seconds) before a lock is considered stale even if its session is technically 'active'.
        *  Real v4 turns rarely exceed 30s; 60s is defense-in-depth. */
       const MAX_TURN_AGE_S = 60

       /** Lock key shape: lock:<workspaceId>:<channel>:<identifier> */
       interface ParsedLockKey {
         raw: string
         workspaceId: string
         channel: 'whatsapp' | 'facebook' | 'instagram'
         identifier: string
       }

       function parseLockKey(raw: string): ParsedLockKey | null {
         // Format: lock:<wsId>:<channel>:<identifier>
         // identifier may contain ':' for some channels? Conservative: split on first 3 colons
         const parts = raw.split(':')
         if (parts.length < 4 || parts[0] !== 'lock') return null
         const workspaceId = parts[1]
         const channel = parts[2] as 'whatsapp' | 'facebook' | 'instagram'
         const identifier = parts.slice(3).join(':')
         if (!['whatsapp', 'facebook', 'instagram'].includes(channel)) return null
         return { raw, workspaceId, channel, identifier }
       }

       export const v2LockCleanupCron = inngest.createFunction(
         {
           id: 'debounce-v2-lock-cleanup',
           name: 'debounce-v2: Lock Cleanup (orphans)',
           retries: 1,
         },
         { cron: 'TZ=America/Bogota */5 * * * *' },
         async ({ step }) => {
           const result = await step.run('sweep-orphaned-locks', async () => {
             // 1. Enumerate all lock:* keys via SCAN (cursor-paginated; safer than KEYS for large sets).
             const lockKeys: string[] = []
             let cursor: number | string = 0
             do {
               const [nextCursor, batch] = await redis.scan(cursor, { match: 'lock:*', count: 200 })
               lockKeys.push(...batch)
               cursor = typeof nextCursor === 'string' ? parseInt(nextCursor) : nextCursor
             } while (cursor !== 0)

             if (lockKeys.length === 0) {
               return { swept: 0, kept: 0, errors: 0, scanned: 0, active_sessions_checked: 0 }
             }

             // 2. Parse keys + collect distinct workspaceIds for the agent_sessions query.
             const parsed: ParsedLockKey[] = []
             for (const k of lockKeys) {
               const p = parseLockKey(k)
               if (p) parsed.push(p)
               else logger.warn({ lockKey: k }, 'malformed lock key — will sweep')
             }
             const workspaceIds = [...new Set(parsed.map(p => p.workspaceId))]

             // 3. D-09 verbatim: fetch active agent_sessions for these workspaces and resolve their
             //    (channel, identifier) via the joined conversations row.
             const supabase = createAdminClient()
             const { data: activeSessions, error: sessErr } = await supabase
               .from('agent_sessions')
               .select(`
                 id,
                 workspace_id,
                 status,
                 conversation:conversations!inner(channel, phone, external_subscriber_id)
               `)
               .in('workspace_id', workspaceIds)
               .eq('status', 'active')

             if (sessErr) {
               logger.error({ err: sessErr.message }, 'agent_sessions query failed — skip sweep this run')
               return { swept: 0, kept: 0, errors: 1, scanned: lockKeys.length, active_sessions_checked: 0, query_error: sessErr.message }
             }

             // 4. Build the set of "lock keys backed by an active session" so we can sweep the rest.
             const activeLockKeys = new Set<string>()
             for (const s of activeSessions ?? []) {
               // conversation may be array (PostgREST relational select) or object — handle both.
               const conv: any = Array.isArray(s.conversation) ? s.conversation[0] : s.conversation
               if (!conv) continue
               const ch = conv.channel as 'whatsapp' | 'facebook' | 'instagram'
               const id = ch === 'whatsapp' ? conv.phone : conv.external_subscriber_id
               if (!id) continue
               activeLockKeys.add(`lock:${s.workspace_id}:${ch}:${id}`)
             }

             // 5. Sweep: any lock NOT in activeLockKeys is orphaned. ALSO sweep "active-but-old" locks
             //    where started_at exceeds MAX_TURN_AGE_S (defense-in-depth — try/finally bypass).
             let swept = 0
             let kept = 0
             let errors = 0
             for (const p of parsed) {
               try {
                 const raw = await redis.get<string>(p.raw)
                 if (!raw) continue  // already gone (TTL beat us)

                 let parsedVal: { holder_uuid?: string; started_at?: string; has_sent_anything?: boolean } = {}
                 try {
                   parsedVal = typeof raw === 'string' ? JSON.parse(raw) : (raw as typeof parsedVal)
                 } catch {
                   // Malformed value — sweep
                   await redis.del(p.raw)
                   emitLockEvent('lock_orphan_swept_by_cron', {
                     lock_key: p.raw,
                     reason: 'malformed_value',
                     workspaceId: p.workspaceId,
                   })
                   swept++
                   continue
                 }

                 const ageMs = parsedVal.started_at ? Date.now() - Date.parse(parsedVal.started_at) : Infinity
                 const isInActiveSet = activeLockKeys.has(p.raw)
                 const isStale = ageMs > MAX_TURN_AGE_S * 1000

                 if (!isInActiveSet || isStale) {
                   await redis.del(p.raw)
                   emitLockEvent('lock_orphan_swept_by_cron', {
                     lock_key: p.raw,
                     reason: !isInActiveSet ? 'no_active_session' : 'stale_age',
                     workspaceId: p.workspaceId,
                     holder_uuid: parsedVal.holder_uuid ?? null,
                     age_ms: ageMs,
                   })
                   swept++
                 } else {
                   kept++
                 }
               } catch (err) {
                 logger.error({ lockKey: p.raw, err: err instanceof Error ? err.message : String(err) }, 'lock sweep error')
                 errors++
               }
             }

             return {
               swept,
               kept,
               errors,
               scanned: lockKeys.length,
               active_sessions_checked: activeLockKeys.size,
             }
           })

           logger.info({ ...result, cronRunAt: new Date().toISOString() }, 'v2-lock-cleanup-cron complete')
           return result
         },
       )
       ```

       Notes:
       - **emitLockEvent('lock_orphan_swept_by_cron', ...)** — this is the NEW 14th typed event added to `LockEventLabel` union in Plan 01 Task 1.3 (REVISION B1 — Plan 01 already updated). If the executor runs Plan 06 before Plan 01's union extension is in place, TS will fail at compile — confirming the dependency wave order.
       - **`scan` vs `keys`:** @upstash/redis 1.38.0 supports `redis.scan(cursor, options)`. If the SDK signature differs, fall back to `redis.keys('lock:*')` — at our scale (<200 active conversations) either works.
       - **The two-stage decision (active-set check + age check)** satisfies D-09 verbatim ("comparando con `agent_sessions` activas") AND adds defense-in-depth for try/finally bypass scenarios.

    2. Add `import { v2LockCleanupCron } from '@/inngest/functions/v2-lock-cleanup-cron'` to `src/app/api/inngest/route.ts`.

    3. Add `v2LockCleanupCron,` to the `functions` array in `route.ts` (alphabetical or logical group — match existing style, e.g., near `observabilityPurgeCron`).

    4. Note `agent-scope.md` Regla 4 — update the comment block listing functions served at the top of `route.ts` to mention the new cron.
  </action>
  <verify>
    <automated>grep -c "v2LockCleanupCron\|debounce-v2-lock-cleanup" src/inngest/functions/v2-lock-cleanup-cron.ts && grep -c "v2LockCleanupCron" src/app/api/inngest/route.ts && grep -c "cron.*5 \* \* \* \*" src/inngest/functions/v2-lock-cleanup-cron.ts && grep -c "agent_sessions" src/inngest/functions/v2-lock-cleanup-cron.ts && grep -c "lock_orphan_swept_by_cron" src/inngest/functions/v2-lock-cleanup-cron.ts && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "v2-lock-cleanup-cron"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "v2LockCleanupCron" src/inngest/functions/v2-lock-cleanup-cron.ts` ≥ 1.
    - `grep -c "v2LockCleanupCron" src/app/api/inngest/route.ts` ≥ 2 (import + functions array).
    - `grep -E "cron: 'TZ=America/Bogota \*/5" src/inngest/functions/v2-lock-cleanup-cron.ts` returns ≥ 1 match.
    - `grep -c "redis.scan\|redis.keys" src/inngest/functions/v2-lock-cleanup-cron.ts` ≥ 1.
    - `grep -c "step.run" src/inngest/functions/v2-lock-cleanup-cron.ts` ≥ 1 (Inngest serialization boundary per LEARNING).
    - **REVISION B1 (D-09 verbatim):** `grep -c "agent_sessions" src/inngest/functions/v2-lock-cleanup-cron.ts` ≥ 2 (query + comment).
    - **REVISION B1 (D-09 verbatim):** `grep -c "status'\?, 'active'\|eq('status', 'active')" src/inngest/functions/v2-lock-cleanup-cron.ts` ≥ 1 (uses status='active' per ACTUAL schema; D-09 said "ended_at IS NULL" in revision text but the real schema is `status` — implementation uses the truth).
    - **REVISION B1:** `grep -c "lock_orphan_swept_by_cron" src/inngest/functions/v2-lock-cleanup-cron.ts` ≥ 1 (emits NEW 14th typed event).
    - `npx tsc --noEmit -p tsconfig.json` zero new errors. If `lock_orphan_swept_by_cron` is rejected by `LockEventLabel` union, that means Plan 01 Task 1.3 wasn't updated — fix Plan 01 first (revision-mode also updates Plan 01's union).
  </acceptance_criteria>
  <done>Cleanup cron defined and registered; sweeps locks comparing against agent_sessions.status='active' per D-09 verbatim (REVISION B1); emits new 14th typed event.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 6.2: Create sandbox InterruptionTab + extend DebugPanelTabId union + TAB_ICONS (LOCK-08 + D-11 + v4-subloop-debug-view LEARNING anti-Pitfall 6) — REVISION W5: declare observability events route</name>
  <read_first>
    - src/lib/sandbox/types.ts (lines 357-365 — DebugPanelTabId union + DebugPanelTab interface)
    - src/app/(dashboard)/sandbox/components/debug-panel/tab-bar.tsx (lines 19-47 — TAB_ICONS Record + tab rendering)
    - src/app/(dashboard)/sandbox/components/debug-panel/subloop-tab.tsx (lines 1-60 — template structure: imports + props + helpers)
    - src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx (find — file that wires tab id → component)
    - .planning/standalone/debounce-interruption-system-v2/DISCUSSION-LOG.md (D-11 sandbox debug panel "Interruption" tab description)
    - .planning/standalone/debounce-interruption-system-v2/RESEARCH.md lines 1025-1029 (Open Question 3 — post-turn fetch, NOT live SSE)
    - Memory note on v4-subloop-debug-view (2026-05-13): "TAB_ICONS exhaustivo Record<DebugPanelTabId> es invariante typecheck-per-commit"
  </read_first>
  <action>
    1. **Extend DebugPanelTabId union** in `src/lib/sandbox/types.ts` (line 357):
       ```ts
       export type DebugPanelTabId = 'pipeline' | 'classify' | 'bloques' | 'tools' | 'state' | 'tokens' | 'ingest' | 'config' | 'subloop' | 'interruption'
       ```

    2. **Update TAB_ICONS** in `src/app/(dashboard)/sandbox/components/debug-panel/tab-bar.tsx` (line 21). The Record is exhaustive — TypeScript catches missing entries. Add the `interruption` key with the `Lock` icon (from lucide-react):
       ```ts
       import { ..., Lock } from 'lucide-react'

       const TAB_ICONS: Record<DebugPanelTabId, React.ComponentType<{ className?: string }>> = {
         ...existing,
         interruption: Lock,
       }
       ```

       **Anti-Pitfall 6 verification:** run `npx tsc --noEmit` — if the union added `'interruption'` but TAB_ICONS forgot it, tsc errors with "Property 'interruption' is missing in type". Confirm tsc clean.

    3. **Create `src/app/(dashboard)/sandbox/components/debug-panel/interruption-tab.tsx`** mirroring `subloop-tab.tsx` structure:
       ```tsx
       'use client'

       /**
        * Interruption Tab Component
        * Standalone: debounce-interruption-system-v2 / Plan 06 (D-11 + LOCK-08).
        *
        * Renders the 14 D-17-extended observability events for the selected turn:
        *   - Banner: lock acquired at (timestamp) / released at (timestamp) / duration
        *   - Holder UUID + key
        *   - Heartbeat count (renewals)
        *   - Pending list size at acquire / at release / cleared count
        *   - 8 checkpoint hits (timeline)
        *   - Interrupt detected? Path A vs Path B abort
        *   - Zombie exit? Force-acquired?
        *   - REVISION B1: lock_orphan_swept_by_cron (14th label)
        *
        * RESEARCH Open Question 3: post-turn fetch (NOT live SSE). User reloads to see updates.
        */

       import { useState, useEffect } from 'react'
       import { Lock, Unlock, AlertTriangle, Clock, Activity, Zap, Trash2 } from 'lucide-react'
       import { Badge } from '@/components/ui/badge'

       interface InterruptionEvent {
         id: string
         category: string
         label: string
         payload: Record<string, unknown>
         created_at: string
       }

       interface InterruptionTabProps {
         conversationId: string | null
         sessionId: string | null
         turnNumber?: number
       }

       const LOCK_EVENT_LABELS = [
         'lock_acquired',
         'lock_acquire_failed_follower',
         'interrupt_written',
         'interrupt_detected_at_ckpt_N',
         'msg_aborted_path_a_combined',
         'msg_aborted_path_b_solo',
         'lock_released_normal',
         'follower_woke',
         'lock_force_acquired_after_ttl_expiry',
         'zombie_lambda_exit',
         'heartbeat_renewed',
         'pending_list_combined',
         'redis_unavailable_fallback_failed',
         'lock_orphan_swept_by_cron',  // REVISION B1 — 14th label
       ] as const

       export function InterruptionTab({ conversationId, sessionId }: InterruptionTabProps) {
         const [events, setEvents] = useState<InterruptionEvent[]>([])
         const [loading, setLoading] = useState(false)

         useEffect(() => {
           if (!conversationId && !sessionId) return
           setLoading(true)
           fetch(`/api/observability/events?session_id=${sessionId ?? ''}&conversation_id=${conversationId ?? ''}&labels=${LOCK_EVENT_LABELS.join(',')}`)
             .then((r) => r.json())
             .then((data) => setEvents(data.events ?? []))
             .finally(() => setLoading(false))
         }, [conversationId, sessionId])

         if (!conversationId && !sessionId) {
           return <div className="text-sm text-muted-foreground p-4">Select a session to inspect lock lifecycle.</div>
         }

         if (loading) return <div className="text-sm text-muted-foreground p-4">Loading lock events…</div>
         if (events.length === 0) return <div className="text-sm text-muted-foreground p-4">No interruption-system-v2 events for this turn (v4-only feature; non-v4 paths use Phase 31).</div>

         // Group + render. Mirror subloop-tab.tsx visual structure.
         return (
           <div className="space-y-4 p-4">
             {events.map((evt) => (
               <div key={evt.id} className="border rounded p-3 space-y-1">
                 <div className="flex items-center gap-2">
                   {getIconForLabel(evt.label)}
                   <Badge variant={getVariantForLabel(evt.label)}>{evt.label}</Badge>
                   <span className="text-xs text-muted-foreground">
                     {new Date(evt.created_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}
                   </span>
                 </div>
                 <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">{JSON.stringify(evt.payload, null, 2)}</pre>
               </div>
             ))}
           </div>
         )
       }

       function getIconForLabel(label: string) {
         if (label === 'lock_acquired') return <Lock className="h-4 w-4 text-green-600" />
         if (label === 'lock_released_normal') return <Unlock className="h-4 w-4 text-blue-600" />
         if (label === 'lock_orphan_swept_by_cron') return <Trash2 className="h-4 w-4 text-purple-600" />
         if (label.startsWith('msg_aborted_') || label === 'zombie_lambda_exit' || label === 'redis_unavailable_fallback_failed') return <AlertTriangle className="h-4 w-4 text-red-600" />
         if (label === 'heartbeat_renewed') return <Activity className="h-4 w-4 text-amber-500" />
         if (label === 'interrupt_detected_at_ckpt_N' || label === 'interrupt_written') return <Zap className="h-4 w-4 text-orange-600" />
         return <Clock className="h-4 w-4 text-muted-foreground" />
       }

       function getVariantForLabel(label: string): 'default' | 'secondary' | 'destructive' | 'outline' {
         if (label === 'lock_acquired' || label === 'lock_released_normal') return 'default'
         if (label.includes('aborted') || label === 'zombie_lambda_exit' || label === 'redis_unavailable_fallback_failed') return 'destructive'
         if (label === 'lock_orphan_swept_by_cron') return 'outline'
         return 'secondary'
       }
       ```

    4. **Wire the new tab into `debug-tabs.tsx`** — open the file (find with `grep -rn "DebugPanelTabId\|InterruptionTab\|SubloopTab" src/app/\(dashboard\)/sandbox/components/debug-panel/`) and add the conditional render: when `activeTab === 'interruption'`, render `<InterruptionTab conversationId={...} sessionId={...} />`. Pass the same props the SubloopTab gets — pattern-match.

    5. **REVISION W5: API endpoint declared in files_modified** — the component fetches `/api/observability/events?session_id=...&labels=...`. Check if such an endpoint exists: `find src/app/api/observability -type f`. If yes, ensure it supports the `labels` query param filter (modify if needed). If not, CREATE the file with a minimal GET handler:
       ```ts
       // src/app/api/observability/events/route.ts (CREATE if missing — REVISION W5)
       import { NextRequest, NextResponse } from 'next/server'
       import { createAdminClient } from '@/lib/supabase/admin'

       export async function GET(req: NextRequest) {
         const sessionId = req.nextUrl.searchParams.get('session_id')
         const conversationId = req.nextUrl.searchParams.get('conversation_id')
         const labels = (req.nextUrl.searchParams.get('labels') ?? '').split(',').filter(Boolean)

         const supabase = createAdminClient()
         let q = supabase.from('agent_observability_events').select('id, category, label, payload, created_at').order('created_at', { ascending: true })
         if (sessionId) q = q.eq('session_id', sessionId)
         else if (conversationId) q = q.eq('conversation_id', conversationId)
         if (labels.length > 0) q = q.in('label', labels)
         const { data, error } = await q.limit(200)
         if (error) return NextResponse.json({ error: error.message }, { status: 500 })
         return NextResponse.json({ events: data ?? [] })
       }
       ```
       Confirm `agent_observability_events` table has `session_id` and `conversation_id` columns (it should per existing collector usage).

       **Either way (create or modify), the file is listed in this plan's `files_modified` per REVISION W5.**

    6. **Default tab visibility** — if there's a default-tabs constant somewhere (`DEFAULT_DEBUG_TABS` or similar), append `'interruption'` so it shows by default. If users opt-in, no change needed.
  </action>
  <verify>
    <automated>grep -c "interruption" src/lib/sandbox/types.ts && grep -c "interruption" src/app/\(dashboard\)/sandbox/components/debug-panel/tab-bar.tsx && test -f "src/app/(dashboard)/sandbox/components/debug-panel/interruption-tab.tsx" && grep -c "InterruptionTab\|interruption-tab" src/app/\(dashboard\)/sandbox/components/debug-panel/debug-tabs.tsx && test -f "src/app/api/observability/events/route.ts" && grep -c "lock_orphan_swept_by_cron" src/app/\(dashboard\)/sandbox/components/debug-panel/interruption-tab.tsx && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "src/app/\(dashboard\)/sandbox"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "'interruption'" src/lib/sandbox/types.ts` ≥ 1 (added to union).
    - `grep -c "interruption:" src/app/(dashboard)/sandbox/components/debug-panel/tab-bar.tsx` ≥ 1 (added to TAB_ICONS — anti-Pitfall 6 from v4-subloop-debug-view).
    - `test -f "src/app/(dashboard)/sandbox/components/debug-panel/interruption-tab.tsx"` succeeds.
    - `grep -c "LOCK_EVENT_LABELS\|lock_acquired" src/app/(dashboard)/sandbox/components/debug-panel/interruption-tab.tsx` ≥ 1.
    - `grep -c "lock_orphan_swept_by_cron" src/app/(dashboard)/sandbox/components/debug-panel/interruption-tab.tsx` ≥ 1 (REVISION B1 — 14th label rendered).
    - `grep -c "InterruptionTab\|interruption-tab" src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx` ≥ 1.
    - `grep -c "America/Bogota" src/app/(dashboard)/sandbox/components/debug-panel/interruption-tab.tsx` ≥ 1 (Regla 2 timezone for display).
    - **REVISION W5:** `test -f "src/app/api/observability/events/route.ts"` succeeds (created or pre-existing — declared in files_modified).
    - `npx tsc --noEmit -p tsconfig.json` reports zero new errors anywhere under `src/app/(dashboard)/sandbox/`.
  </acceptance_criteria>
  <done>Sandbox tab shipped; user can inspect lock lifecycle visually for D-19 Fase 4. Events route declared per REVISION W5.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit -p tsconfig.json` clean.
2. Cron registered in route.ts; visible in Inngest dashboard after deploy.
3. Tab visible in sandbox `/sandbox` after `npm run dev` on port 3020.
4. No regression in existing tabs (test by clicking through pipeline → classify → ... → interruption).
5. REVISION B1 grep assertions: `grep -c "agent_sessions" .planning/standalone/debounce-interruption-system-v2/06-PLAN.md` ≥ 2; `grep -c "status'\?, 'active'\|eq('status', 'active')" .planning/standalone/debounce-interruption-system-v2/06-PLAN.md` ≥ 1; `grep -c "lock_orphan_swept_by_cron" .planning/standalone/debounce-interruption-system-v2/06-PLAN.md` ≥ 2.
6. REVISION B2: `grep -c "depends_on:.*04.*05" .planning/standalone/debounce-interruption-system-v2/06-PLAN.md` ≥ 1.
</verification>

<success_criteria>
- LOCK-06 (cron) + LOCK-08 (tab) shipped.
- D-09 layer 3 (cleanup) implemented per VERBATIM (REVISION B1 — agent_sessions comparison + 14th typed event).
- D-11 (sandbox visualization) operational.
- TypeScript exhaustive Record invariant preserved (anti-regression from v4-subloop-debug-view LEARNING).
- Plan 06 depends_on explicitly lists 04 + 05 (REVISION B2) for merge ordering.
- Observability events route declared in files_modified (REVISION W5).
</success_criteria>

<output>
After completion, create `.planning/standalone/debounce-interruption-system-v2/06-SUMMARY.md` listing: cron schedule + REVISION B1 sweep heuristic implemented (D-09 verbatim agent_sessions comparison + age defense-in-depth + 14th typed event) + whether `/api/observability/events` endpoint pre-existed or was created here per REVISION W5 + confirmation that TAB_ICONS Record is exhaustive (anti-Pitfall 6 satisfied) + confirmation that Plan 01 Task 1.3 LockEventLabel union was successfully bumped to 14 entries.
</output>
