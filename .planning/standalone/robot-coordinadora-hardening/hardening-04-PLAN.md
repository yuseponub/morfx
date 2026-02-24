---
phase: robot-coordinadora-hardening
plan: 04
type: execute
wave: 2
depends_on: ["hardening-01"]
files_modified:
  - src/app/api/webhooks/robot-callback/route.ts
autonomous: true

must_haves:
  truths:
    - "Callback payload is strictly validated: itemId must be a valid UUID, status must be 'success' or 'error'"
    - "batch_completed event is emitted exactly once per job using atomic DB flag guard"
    - "inngest.send failure in callback returns 500 (not 200) so the robot service can retry"
    - "Invalid payloads are rejected with 400 and descriptive error messages"
  artifacts:
    - path: "src/app/api/webhooks/robot-callback/route.ts"
      provides: "Hardened callback webhook with validation, idempotent emission, error propagation"
      contains: "batch_completed_emitted"
  key_links:
    - from: "src/app/api/webhooks/robot-callback/route.ts"
      to: "robot_jobs.batch_completed_emitted"
      via: "atomic UPDATE WHERE batch_completed_emitted = false"
      pattern: "batch_completed_emitted"
    - from: "src/app/api/webhooks/robot-callback/route.ts"
      to: "inngest.send"
      via: "try-catch returning 500 on failure"
      pattern: "status: 500"
---

<objective>
Harden the robot callback webhook with strict payload validation, idempotent batch_completed emission using the DB flag, and proper error propagation (500 on inngest.send failure).

Purpose: Fixes P1 Bugs #5 (duplicate batch_completed events) and #6 (inngest.send failure silenced), and P2 Bug #14 (callback payload validation). Without the idempotent flag, two concurrent callbacks that complete a job can both emit batch_completed, causing duplicate orchestrator completions. Without 500 on inngest.send failure, the orchestrator times out waiting for an event that was never sent.

Output: Updated robot-callback/route.ts with all 3 fixes.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/robot-coordinadora-hardening/RESEARCH.md
@src/app/api/webhooks/robot-callback/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add strict payload validation</name>
  <files>src/app/api/webhooks/robot-callback/route.ts</files>
  <action>
Replace the current minimal validation (lines 72-80) with strict validation BEFORE the item lookup:

```typescript
// ------------------------------------------------------------------
// 2. Parse and validate payload
// ------------------------------------------------------------------
let body: Record<string, unknown>

try {
  body = await request.json()
} catch {
  return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
}

const { itemId, status, trackingNumber, errorType, errorMessage } = body as {
  itemId?: unknown
  status?: unknown
  trackingNumber?: unknown
  errorType?: unknown
  errorMessage?: unknown
}

// Required fields
if (!itemId || typeof itemId !== 'string') {
  return NextResponse.json({ error: 'Invalid itemId: must be a non-empty string' }, { status: 400 })
}

if (status !== 'success' && status !== 'error') {
  return NextResponse.json({ error: 'Invalid status: must be "success" or "error"' }, { status: 400 })
}

// UUID format validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
if (!UUID_REGEX.test(itemId)) {
  return NextResponse.json({ error: 'Invalid itemId: not a valid UUID' }, { status: 400 })
}

// Validate tracking number format on success
const validatedTrackingNumber = typeof trackingNumber === 'string' ? trackingNumber : undefined
if (status === 'success' && validatedTrackingNumber) {
  if (validatedTrackingNumber.length < 3 || validatedTrackingNumber.length > 50) {
    return NextResponse.json({ error: 'Invalid trackingNumber: length must be between 3 and 50' }, { status: 400 })
  }
}

// Validate errorType enum
const validErrorTypes = ['validation', 'portal', 'timeout', 'unknown'] as const
type ValidErrorType = typeof validErrorTypes[number]
let validatedErrorType: ValidErrorType | undefined
if (status === 'error' && errorType) {
  if (typeof errorType !== 'string' || !validErrorTypes.includes(errorType as ValidErrorType)) {
    return NextResponse.json({ error: `Invalid errorType: must be one of ${validErrorTypes.join(', ')}` }, { status: 400 })
  }
  validatedErrorType = errorType as ValidErrorType
}

const validatedErrorMessage = typeof errorMessage === 'string' ? errorMessage.slice(0, 500) : undefined
```

Then update the `updateJobItemResult` call to use validated variables:
```typescript
const result = await updateJobItemResult(ctx, {
  itemId,
  status: status as 'success' | 'error',
  trackingNumber: validatedTrackingNumber,
  errorType: validatedErrorType,
  errorMessage: validatedErrorMessage,
})
```
  </action>
  <verify>
1. Grep for `UUID_REGEX` in route.ts -- should find 1 match
2. Grep for `validErrorTypes` in route.ts -- should find the validation
3. Grep for `slice(0, 500)` in route.ts -- should find the error message length limit
  </verify>
  <done>
Callback payload is strictly validated: UUID format for itemId, enum for status and errorType, length limits for trackingNumber and errorMessage.
  </done>
</task>

<task type="auto">
  <name>Task 2: Idempotent batch_completed emission + 500 on send failure</name>
  <files>src/app/api/webhooks/robot-callback/route.ts</files>
  <action>
Replace section 6 (lines 181-206) with the idempotent batch_completed emission pattern:

```typescript
// ------------------------------------------------------------------
// 6. Check if batch completed -> emit robot/job.batch_completed
//    Uses atomic batch_completed_emitted flag to prevent duplicate events.
//    Only the first callback to flip the flag from false to true emits.
// ------------------------------------------------------------------
const { data: emitGuard } = await supabase
  .from('robot_jobs')
  .update({ batch_completed_emitted: true })
  .eq('id', item.job_id)
  .eq('status', 'completed')
  .eq('batch_completed_emitted', false)
  .select('id, success_count, error_count')
  .maybeSingle()

if (emitGuard) {
  // This callback won the race -- emit the batch_completed event
  try {
    await (inngest.send as any)({
      name: 'robot/job.batch_completed',
      data: {
        jobId: item.job_id,
        workspaceId,
        successCount: emitGuard.success_count,
        errorCount: emitGuard.error_count,
      },
    })
    console.log(
      `[robot-callback] Batch completed: job ${item.job_id} (${emitGuard.success_count} success, ${emitGuard.error_count} error)`
    )
  } catch (err) {
    console.error(`[robot-callback] Failed to emit batch_completed for job ${item.job_id}:`, err)
    // Reset the flag so a retry can re-emit
    await supabase
      .from('robot_jobs')
      .update({ batch_completed_emitted: false })
      .eq('id', item.job_id)
    // Return 500 so the robot service retries this callback
    return NextResponse.json(
      { error: 'Failed to notify orchestrator. Please retry.' },
      { status: 500 }
    )
  }
}
// If emitGuard is null: either job is not completed yet, or another callback already emitted
```

This replaces the old pattern that:
- Read job status AFTER update (race condition: two callbacks both see 'completed')
- Swallowed inngest.send failures (returned 200 OK even on failure)

The new pattern:
- Uses atomic `UPDATE ... WHERE batch_completed_emitted = false` (only one wins the race)
- Returns 500 on inngest.send failure (robot service retries)
- Resets the flag on send failure so the retry can succeed

Remove the old section 6 code entirely (the `updatedJob` select + status check + try-catch that returns 200).
  </action>
  <verify>
1. Grep for `batch_completed_emitted` in route.ts -- should find multiple references (the atomic guard)
2. Grep for `status: 500` in route.ts -- should find at least 1 match (inngest.send failure response)
3. Verify the old pattern (`updatedJob && updatedJob.status === 'completed'`) is GONE
4. Run `npx tsc --noEmit` to verify TypeScript compilation
  </verify>
  <done>
batch_completed event is emitted exactly once using atomic DB flag. inngest.send failure returns 500 + resets flag for retry. Old race-prone pattern completely removed.
  </done>
</task>

</tasks>

<verification>
1. Payload validation rejects malformed requests with descriptive 400 errors
2. batch_completed_emitted flag prevents duplicate events (atomic UPDATE WHERE)
3. inngest.send failure returns 500 (not 200) with flag reset
4. TypeScript compiles without errors
5. No remnants of old status-check pattern for batch completion
</verification>

<success_criteria>
- P1 Bug #5 (duplicate batch_completed) is fixed -- atomic flag guard
- P1 Bug #6 (inngest.send failure silenced) is fixed -- returns 500 + resets flag
- P2 Bug #14 (payload validation) is fixed -- UUID validation, enum checks, length limits
- Code compiles with `npx tsc --noEmit`
</success_criteria>

<output>
After completion, create `.planning/standalone/robot-coordinadora-hardening/hardening-04-SUMMARY.md`
</output>
