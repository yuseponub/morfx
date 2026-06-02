---
phase: 42-session-lifecycle
plan: 03
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/lib/agents/timer-guard.ts
  - src/inngest/functions/agent-timers.ts
  - src/inngest/functions/agent-timers-v3.ts
autonomous: true

must_haves:
  truths:
    - "Every Inngest handler that acts on a sessionId checks session.status === 'active' before doing any work, and aborts silently otherwise"
    - "Aborted handlers log at info level with sessionId + observed status"
    - "All 6 handlers from 42-RESEARCH.md ## Handler Audit have the check in place"
  artifacts:
    - src/lib/agents/timer-guard.ts
  key_links:
    - "Single shared helper prevents drift across handlers"
    - "Check is read-only — no domain layer needed (Regla 3 exception per RESEARCH)"
---

<objective>
Insert a defensive session-status check at the start of every Inngest timer handler that operates on a `sessionId`. Prevents zombie timers from firing on sessions closed by the nightly cron (or by any future close path).

Purpose: Safety net that makes session closure resilient to any stale Inngest event in flight. 100% correct even if Inngest cancel-by-reference is never implemented.
Output: One small helper file + 6 call-site insertions across two timer files.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/42-session-lifecycle/42-CONTEXT.md
@.planning/phases/42-session-lifecycle/42-RESEARCH.md
@src/inngest/functions/agent-timers.ts
@src/inngest/functions/agent-timers-v3.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create shared timer-guard helper</name>
  <files>src/lib/agents/timer-guard.ts</files>
  <action>
Create a small helper exposing a single function that all timer handlers can call. Reference 42-RESEARCH.md ## Architecture Patterns — Pattern 3 and ## Handler Audit "Helper pattern" section.

```typescript
// src/lib/agents/timer-guard.ts
// Phase 42 — shared defensive check: does this session still accept timer work?
// See .planning/phases/42-session-lifecycle/42-CONTEXT.md §3.4 for rationale.

import { createAdminClient } from '@/lib/supabase/admin'
import type { Logger } from 'pino'

export type TimerGuardResult =
  | { ok: true }
  | { ok: false; status: string | 'not_found' }

/**
 * Defensive check at the start of every Inngest timer handler that operates
 * on a sessionId. Returns {ok: true} if the session is still 'active', or
 * {ok: false, status} if the session was closed / handed_off / deleted and
 * the handler should abort.
 *
 * Read-only query — no domain layer involvement (Regla 3 applies only to mutations).
 * Uses a one-column select by primary key for minimum overhead.
 */
export async function checkSessionActive(sessionId: string): Promise<TimerGuardResult> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('agent_sessions')
    .select('status')
    .eq('id', sessionId)
    .single()

  if (error || !data) {
    return { ok: false, status: 'not_found' }
  }
  if (data.status !== 'active') {
    return { ok: false, status: data.status }
  }
  return { ok: true }
}

/**
 * Convenience: run the check, log at info level if aborted, return boolean.
 * Handlers can use either this or checkSessionActive directly.
 */
export async function guardTimerHandler(
  sessionId: string,
  logger: Logger,
  handlerName: string
): Promise<boolean> {
  const result = await checkSessionActive(sessionId)
  if (!result.ok) {
    logger.info(
      { sessionId, handlerName, observedStatus: result.status },
      'Timer handler aborted: session no longer active'
    )
    return false
  }
  return true
}
```

Notes:
- Uses `.single()` (not `.maybeSingle()`) — by-PK query should have exactly 1 row; missing row is abnormal and should be treated as aborted (see 42-RESEARCH.md ## Architecture Patterns — Pattern 3 "Anti-Patterns").
- Accepts a `pino Logger` to keep logs scoped to the calling handler's module.
- Returns a discriminated union so handlers can log the observed status.
  </action>
  <verify>
- `npm run typecheck` passes.
- `grep -n 'checkSessionActive' src/lib/agents/timer-guard.ts` returns 2 hits (export + internal reference).
  </verify>
  <done>Helper file exists and exports both `checkSessionActive` and `guardTimerHandler`.</done>
</task>

<task type="auto">
  <name>Task 2: Insert defensive check in all 5 V1 timer handlers (agent-timers.ts)</name>
  <files>src/inngest/functions/agent-timers.ts</files>
  <action>
Insert the defensive check at the start of 5 handler callbacks per 42-RESEARCH.md ## Handler Audit (rows 1-5). Each is inside a `step.run('evaluate-and-execute', async () => {...})` or equivalent. The check must go AS THE FIRST STATEMENT inside the callback, before `getSessionManager()` / `sm.getSession(sessionId)`.

Add the import at the top of the file (alongside other `@/lib/agents/*` imports):
```typescript
import { checkSessionActive } from '@/lib/agents/timer-guard'
```

For EACH of the 5 handlers below, insert the same defensive block at the location specified in 42-RESEARCH.md ## Handler Audit:

| # | Handler | Def line | Insert location per RESEARCH |
|---|---|---|---|
| 1 | `ingestTimer` | 261 | First line inside `step.run('evaluate-and-execute')` at line 286 |
| 2 | `dataCollectionTimer` | 327 | First line inside `step.run('evaluate-and-execute')` at line 362 |
| 3 | `promosTimer` | 401 | First line inside `step.run('evaluate-and-execute')` at line 430 |
| 4 | `resumenTimer` | 469 | First line inside `step.run('evaluate-and-execute')` at line 498 |
| 5 | `silenceTimer` | 542 | Inside `step.run('send-retake')` at line 572, **AFTER** the agent-enabled check (lines 573-584), **BEFORE** reading `session_state` |

Insertion snippet (use for handlers 1-4; for handler 5 use "silence timer aborted" as the handlerName):
```typescript
      // Phase 42: defensive check — abort if session no longer active
      const guardResult = await checkSessionActive(sessionId)
      if (!guardResult.ok) {
        logger.info(
          { sessionId, handlerName: '<HANDLER_NAME>', observedStatus: guardResult.status },
          'Timer handler aborted: session no longer active'
        )
        return { status: 'aborted' as const, reason: 'session_not_active' }
      }
```

Where `<HANDLER_NAME>` is `ingestTimer`, `dataCollectionTimer`, `promosTimer`, `resumenTimer`, `silenceTimer` respectively.

Critical rules:
- Use the existing `logger` variable in each file — do NOT create a new one.
- If a handler's `logger` is not yet imported via `createModuleLogger`, it already is (every Inngest function in morfx uses it per 42-RESEARCH.md ## Standard Stack).
- Keep the return shape consistent with what each handler already returns on its abort paths (most return `{ status: 'aborted', ... }`). If a handler uses a different shape, adapt the defensive return to match, but preserve the info log.
- Do NOT remove or modify any existing code in these handlers — this is pure insertion.
- See 42-RESEARCH.md ## Architecture Patterns — Pattern 3 "Anti-Patterns" for why the check must go INSIDE `step.run` (not before `step.waitForEvent`).

After inserting all 5 checks, run typecheck to confirm no broken references.
  </action>
  <verify>
- `grep -n 'checkSessionActive' src/inngest/functions/agent-timers.ts` returns 6 hits (1 import + 5 call sites).
- `grep -n 'Timer handler aborted' src/inngest/functions/agent-timers.ts` returns 5 hits.
- `npm run typecheck` passes.
- Each defensive check is BEFORE the first call to `sm.getSession(sessionId)` in its handler.
  </verify>
  <done>All 5 V1 timer handlers have the defensive check in the correct location with correct handlerName label.</done>
</task>

<task type="auto">
  <name>Task 3: Insert defensive check in V3 timer handler (agent-timers-v3.ts)</name>
  <files>src/inngest/functions/agent-timers-v3.ts</files>
  <action>
Insert the defensive check in the `v3Timer` handler per 42-RESEARCH.md ## Handler Audit row 6 and ## Code Examples — Example 2.

Exact location: inside `step.run('execute-timer')` starting at line 245. Insert the check **AFTER** the `conversations.is_agent_enabled` check (lines 249-257) and **BEFORE** line 260 (the `SessionManager` dynamic import). Place it right between the disabled-check return statement and the `const { SessionManager } = await import(...)` line.

Add import at top of file:
```typescript
import { checkSessionActive } from '@/lib/agents/timer-guard'
```

Insert:
```typescript
      // Phase 42: defensive check — abort if session no longer active
      const guardResult = await checkSessionActive(sessionId)
      if (!guardResult.ok) {
        logger.info(
          { sessionId, level, handlerName: 'v3Timer', observedStatus: guardResult.status },
          'V3 timer aborted: session no longer active'
        )
        return { status: 'skipped' as const, action: 'session_not_active' }
      }
```

Note the `level` field in the log — v3Timer has a `level` variable in scope (L2/L4/L5) per the handler signature. Include it for observability.

Note the return shape uses `{ status: 'skipped', action: 'session_not_active' }` matching the existing return shape of v3Timer's other abort paths (per 42-RESEARCH.md Example 2).

Per 42-RESEARCH.md ## Common Pitfalls — Pitfall 4: the `concurrency: [{ key: 'event.data.sessionId', limit: 1 }]` setting on v3Timer does NOT prevent stale firings. The defensive check is still required.
  </action>
  <verify>
- `grep -n 'checkSessionActive' src/inngest/functions/agent-timers-v3.ts` returns 2 hits (import + call).
- `grep -n 'V3 timer aborted' src/inngest/functions/agent-timers-v3.ts` returns 1 hit.
- `npm run typecheck` passes.
- Check is located between the `is_agent_enabled` disabled-return branch and the `SessionManager` dynamic import (approximately the line 258-259 gap).
  </verify>
  <done>v3Timer has the defensive check in the correct position with `level` included in the log context.</done>
</task>

</tasks>

<verification>
- Helper file created with exports
- Total 6 call sites added: 5 in agent-timers.ts + 1 in agent-timers-v3.ts (matches 42-RESEARCH.md ## Handler Audit exactly)
- Typecheck passes for all 3 modified files
- No existing behavior in the 6 handlers was modified — pure insertions
</verification>

<success_criteria>
- All 6 handlers from the research Handler Audit table have the check
- If a session's status becomes 'closed' or 'handed_off' between event fire and handler run, the handler aborts silently with an info log
- Handler return shapes are preserved per-handler
</success_criteria>

<output>
Create `.planning/phases/42-session-lifecycle/42-03-SUMMARY.md` listing the 6 insertion points with final line numbers (post-edit) for future reference.
</output>
