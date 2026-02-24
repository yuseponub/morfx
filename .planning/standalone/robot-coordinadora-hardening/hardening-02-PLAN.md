---
phase: robot-coordinadora-hardening
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - src/inngest/functions/robot-orchestrator.ts
autonomous: true

must_haves:
  truths:
    - "Fetch calls to robot service have a timeout of 60s per order + 10 minutes margin"
    - "Settle sleep is 5 seconds (not 2) to reduce waitForEvent race condition probability"
    - "onFailure handlers report descriptive error messages to the chat via job error_message"
    - "waitForEvent timeout uses 60s/order + 10min margin formula"
  artifacts:
    - path: "src/inngest/functions/robot-orchestrator.ts"
      provides: "Hardened orchestrator functions with timeouts and error reporting"
      contains: "AbortSignal.timeout"
  key_links:
    - from: "src/inngest/functions/robot-orchestrator.ts"
      to: "robot service fetch calls"
      via: "AbortSignal.timeout on all fetch() calls"
      pattern: "AbortSignal\\.timeout"
    - from: "src/inngest/functions/robot-orchestrator.ts"
      to: "updateJobStatus"
      via: "onFailure with error message propagation"
      pattern: "onFailure"
---

<objective>
Harden the Inngest robot orchestrator functions with fetch timeouts, increased settle sleep, improved timeout calculations, and better onFailure error reporting.

Purpose: Fixes P0 Bugs #3 (poor error reporting) and #4 (settle sleep too short), P1 Bug #9 (no fetch timeout), and P2 Bug #12 (timeout calculation formula). Without fetch timeouts, a hung robot service causes the orchestrator to wait indefinitely, consuming Inngest execution time. Without good error reporting, failed jobs show generic errors in the chat instead of actionable messages.

Output: Updated robot-orchestrator.ts with all 4 fixes applied to robotOrchestrator and guideLookupOrchestrator functions.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/robot-coordinadora-hardening/RESEARCH.md
@src/inngest/functions/robot-orchestrator.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add AbortSignal.timeout to fetch calls + update timeout formula</name>
  <files>src/inngest/functions/robot-orchestrator.ts</files>
  <action>
For **robotOrchestrator** (dispatch-to-robot step, around line 95):
1. Before the fetch call, compute: `const fetchTimeoutMs = (orders.length * 60_000) + (10 * 60_000)`
2. Add `signal: AbortSignal.timeout(fetchTimeoutMs)` to the fetch options
3. Log the timeout: `console.log(\`[robot-orchestrator] Fetch timeout: ${Math.round(fetchTimeoutMs / 1000)}s for ${orders.length} orders\`)`

For **guideLookupOrchestrator** (dispatch-to-robot step, around line 235):
1. Before the fetch call, compute: `const fetchTimeoutMs = (pedidoNumbers.length * 60_000) + (10 * 60_000)`
2. Add `signal: AbortSignal.timeout(fetchTimeoutMs)` to the fetch options
3. Log the timeout

For **waitForEvent timeouts** (both orchestrators):
- robotOrchestrator (line 131): Change from `(orders.length * 30_000) + (5 * 60_000)` to `(orders.length * 60_000) + (10 * 60_000)`
- guideLookupOrchestrator (line 269): Change from `(pedidoNumbers.length * 10_000) + (3 * 60_000)` to `(pedidoNumbers.length * 60_000) + (10 * 60_000)`
- Add comment: `// 60s per order + 10min base margin`

For **settle sleep** (both orchestrators):
- robotOrchestrator (line 127): Change `step.sleep('settle', '2s')` to `step.sleep('settle', '5s')`
- guideLookupOrchestrator (line 264): Change `step.sleep('settle', '2s')` to `step.sleep('settle', '5s')`
- Update comment: `// 5s settle to mitigate Inngest waitForEvent race (issue #1433)`

Do NOT touch ocrGuideOrchestrator, pdfGuideOrchestrator, or excelGuideOrchestrator -- they don't call external robot services via fetch, so they don't need these changes.
  </action>
  <verify>
1. Grep for `AbortSignal.timeout` in robot-orchestrator.ts -- should find exactly 2 matches (one per external-service orchestrator)
2. Grep for `'2s'` in robot-orchestrator.ts -- should find 0 matches (all settle sleeps updated to 5s)
3. Grep for `'5s'` in robot-orchestrator.ts -- should find exactly 2 matches
4. Grep for `30_000` and `10_000` in robot-orchestrator.ts -- should find 0 matches (old timeout formulas removed)
5. Run `npx tsc --noEmit` to verify TypeScript compilation
  </verify>
  <done>
Both robotOrchestrator and guideLookupOrchestrator have AbortSignal.timeout on fetch calls (60s/order + 10min), 5s settle sleep, and updated waitForEvent timeout formula.
  </done>
</task>

<task type="auto">
  <name>Task 2: Improve onFailure error reporting for all orchestrators</name>
  <files>src/inngest/functions/robot-orchestrator.ts</files>
  <action>
Update the `onFailure` handlers for robotOrchestrator and guideLookupOrchestrator to:

1. **Extract a more descriptive error message** from the failure event. The current code just logs the error but the user never sees it. The fix: write a human-readable error message to the job's `error_message` field or to a system message visible in the chat.

Since robot_jobs table doesn't have an error_message column, use an alternative approach: when the orchestrator marks the job as failed (both in onFailure and in mark-timeout-failed), update the LAST item in the job (or create a synthetic error) that explains what happened.

Actually, the simplest approach is to update `updateJobStatus` call in onFailure to also log the error to the console with sufficient context. But MORE importantly, update the timeout failure path (mark-timeout-failed step) to set a descriptive message:

For **onFailure** in robotOrchestrator (line 47-63):
```typescript
onFailure: async ({ event }) => {
  const originalEvent = (event as any).data?.event
  const jobId = originalEvent?.data?.jobId as string | undefined
  const workspaceId = originalEvent?.data?.workspaceId as string | undefined
  const errorMessage = (event as any).data?.error?.message ?? 'Error desconocido'

  console.error(`[robot-orchestrator] Function failed for job ${jobId}: ${errorMessage}`)

  if (jobId && workspaceId) {
    // Mark job as failed
    await updateJobStatus(
      { workspaceId, source: 'inngest-orchestrator' },
      { jobId, status: 'failed' }
    )

    // Write error to last pending item so the UI can display it
    const supabase = (await import('@/lib/supabase/admin')).createAdminClient()
    const { data: pendingItem } = await supabase
      .from('robot_job_items')
      .select('id')
      .eq('job_id', jobId)
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle()

    if (pendingItem) {
      await supabase
        .from('robot_job_items')
        .update({
          status: 'error',
          error_type: 'unknown',
          error_message: `Error del orquestador: ${errorMessage}`,
          completed_at: new Date().toISOString(),
        })
        .eq('id', pendingItem.id)
    }
  }
},
```

Apply the same pattern to guideLookupOrchestrator's onFailure.

For the **mark-timeout-failed** steps in both orchestrators, add a similar error item write:
```typescript
await step.run('mark-timeout-failed', async () => {
  await updateJobStatus(
    { workspaceId, source: 'inngest-orchestrator' },
    { jobId, status: 'failed' }
  )

  // Write timeout error to a pending item for UI visibility
  const supabase = (await import('@/lib/supabase/admin')).createAdminClient()
  const { data: pendingItem } = await supabase
    .from('robot_job_items')
    .select('id')
    .eq('job_id', jobId)
    .eq('status', 'pending')
    .limit(1)
    .maybeSingle()

  if (pendingItem) {
    await supabase
      .from('robot_job_items')
      .update({
        status: 'error',
        error_type: 'timeout',
        error_message: 'Tiempo de espera agotado. El servicio del robot no respondio a tiempo.',
        completed_at: new Date().toISOString(),
      })
      .eq('id', pendingItem.id)
  }
})
```

Do NOT add error reporting to ocrGuideOrchestrator, pdfGuideOrchestrator, or excelGuideOrchestrator -- they process locally and already have per-item error handling.
  </action>
  <verify>
1. Grep for `Error del orquestador` in robot-orchestrator.ts -- should find 2 matches (one per external orchestrator onFailure)
2. Grep for `Tiempo de espera agotado` in robot-orchestrator.ts -- should find 2 matches (one per external orchestrator timeout step)
3. Run `npx tsc --noEmit` to verify TypeScript compilation
  </verify>
  <done>
onFailure handlers write descriptive error messages to a pending item (visible in chat UI). Timeout failures write a timeout-specific error message. Users see "Error del orquestador: ..." or "Tiempo de espera agotado..." instead of a generic "Job failed" status.
  </done>
</task>

</tasks>

<verification>
1. All fetch() calls to robot service have AbortSignal.timeout
2. Settle sleep is 5 seconds in both external-service orchestrators
3. Timeout formula is 60s/order + 10min in both orchestrators
4. onFailure handlers write error details to a job item for UI display
5. Timeout failure steps write descriptive timeout error to a job item
6. TypeScript compiles without errors
7. OCR/PDF/Excel orchestrators are NOT modified (they don't call external robot service)
</verification>

<success_criteria>
- P0 Bug #3 (poor error reporting) is fixed -- onFailure writes error to item for chat display
- P0 Bug #4 (settle sleep too short) is fixed -- increased from 2s to 5s
- P1 Bug #9 (no fetch timeout) is fixed -- AbortSignal.timeout on all fetch calls
- P2 Bug #12 (timeout calculation) is fixed -- 60s/order + 10min margin
- Code compiles with `npx tsc --noEmit`
</success_criteria>

<output>
After completion, create `.planning/standalone/robot-coordinadora-hardening/hardening-02-SUMMARY.md`
</output>
