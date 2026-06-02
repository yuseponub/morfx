---
phase: 42-session-lifecycle
plan: 02
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/inngest/functions/close-stale-sessions.ts
  - src/app/api/inngest/route.ts
autonomous: true

must_haves:
  truths:
    - "Inngest cron 'close-stale-sessions' runs daily at 02:00 America/Bogota"
    - "Cron invokes close_stale_agent_sessions() RPC and logs count of closed sessions"
    - "Function is registered in src/app/api/inngest/route.ts and visible in Inngest dashboard after deploy"
  artifacts:
    - src/inngest/functions/close-stale-sessions.ts
  key_links:
    - "Cron TZ syntax: 'TZ=America/Bogota 0 2 * * *' (inline prefix, Inngest v3.51.0)"
    - "Follows task-overdue-cron.ts precedent exactly"
---

<objective>
Create the Inngest scheduled function `close-stale-sessions` that runs nightly at 02:00 America/Bogota and calls the `close_stale_agent_sessions()` RPC (created in 01-PLAN). Register it in the Inngest serve() entrypoint so it actually fires in production.

Purpose: Automated nightly cleanup that closes sessions which had no activity today, preserving sessions still active past midnight.
Output: One new Inngest function file + route.ts registration.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/42-session-lifecycle/42-CONTEXT.md
@.planning/phases/42-session-lifecycle/42-RESEARCH.md
@src/inngest/functions/task-overdue-cron.ts
@src/app/api/inngest/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create close-stale-sessions Inngest cron function</name>
  <files>src/inngest/functions/close-stale-sessions.ts</files>
  <action>
Create the file following the `task-overdue-cron.ts` precedent exactly (see 42-RESEARCH.md ## Architecture Patterns — Pattern 1). Use the RPC variant from 42-RESEARCH.md ## Code Examples — Example 1 (NOT the JS date-math variant).

Structure:
```typescript
import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/admin'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('close-stale-sessions')

export const closeStaleSessionsCron = inngest.createFunction(
  {
    id: 'close-stale-sessions',
    name: 'Close Stale Agent Sessions',
    retries: 1,
  },
  { cron: 'TZ=America/Bogota 0 2 * * *' },  // Daily 02:00 America/Bogota
  async ({ step }) => {
    const result = await step.run('close-stale', async () => {
      const supabase = createAdminClient()
      const { data, error } = await supabase.rpc('close_stale_agent_sessions')
      if (error) {
        logger.error({ error }, 'close_stale_agent_sessions RPC failed')
        throw error
      }
      const closedCount = data?.[0]?.closed_count ?? 0
      return { closedCount }
    })

    logger.info(
      { closedCount: result.closedCount, cronRunAt: new Date().toISOString() },
      'close-stale-sessions cron complete'
    )
    return result
  }
)
```

Critical rules (from 42-RESEARCH.md ## Common Pitfalls):
- Cron string format MUST be `'TZ=America/Bogota 0 2 * * *'` (inline TZ prefix — Inngest v3 has no separate timezone option). Verified against Inngest official docs.
- Use `createAdminClient()` (not a regular client) — matches `task-overdue-cron.ts` pattern.
- Use `createModuleLogger` from `@/lib/audit/logger` (matches other Inngest functions — see 42-RESEARCH.md ## Standard Stack).
- RPC call must throw on error so Inngest retries (retries: 1).
- Log structured data: closedCount + timestamp for observability.

Do NOT:
- Do NOT inline the UPDATE SQL in JS (RPC is the chosen approach per RESEARCH open question #3).
- Do NOT add cancellation events, concurrency limits, or rate limits — this is a single daily cron.
- Do NOT add retry-on-23505 here (that belongs in createSession, handled in 04-PLAN).
  </action>
  <verify>
- File compiles (`npm run typecheck` or equivalent).
- Import of `closeStaleSessionsCron` resolves.
- No `require` / CJS — pure ESM matching task-overdue-cron.ts style.
  </verify>
  <done>Function file exists, typechecks, exports `closeStaleSessionsCron` as a named export.</done>
</task>

<task type="auto">
  <name>Task 2: Register cron in Inngest serve() route</name>
  <files>src/app/api/inngest/route.ts</files>
  <action>
Add two lines to `src/app/api/inngest/route.ts` per 42-RESEARCH.md ## Code Examples — Example 4:

1. At the top of the file (with the other Inngest function imports):
```typescript
import { closeStaleSessionsCron } from '@/inngest/functions/close-stale-sessions'
```

2. Inside the `functions: [...]` array in `serve({...})`, add `closeStaleSessionsCron` as a bare identifier. Place it directly after `taskOverdueCron` (keep crons grouped at the bottom of the list — that's the convention in this file).

Do NOT spread it — it's a single function, not an array. Do NOT modify any other imports or functions in this file.

Reference 42-RESEARCH.md ## Common Pitfalls — Pitfall 3: if this registration is missed, the cron silently never runs.
  </action>
  <verify>
- `grep -n 'closeStaleSessionsCron' src/app/api/inngest/route.ts` returns 2 hits (import + array entry).
- `npm run typecheck` passes.
- After deploy (done in 05-PLAN), function should appear in Inngest dashboard function list.
  </verify>
  <done>Cron is registered and will be picked up by Inngest on next deploy.</done>
</task>

</tasks>

<verification>
- Both files exist and typecheck
- Cron string uses exact `TZ=America/Bogota 0 2 * * *` format
- RPC name matches the one created in 01-PLAN (`close_stale_agent_sessions`)
- Registration in route.ts has import + array entry
</verification>

<success_criteria>
- Typecheck clean
- Function will appear in Inngest dashboard after 05-PLAN push
- When cron fires, logs `closedCount` to pino logger
</success_criteria>

<output>
Create `.planning/phases/42-session-lifecycle/42-02-SUMMARY.md` noting file paths created and any deviations from the RESEARCH template.
</output>
