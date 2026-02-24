---
phase: robot-coordinadora-hardening
plan: 03
type: execute
wave: 2
depends_on: ["hardening-01"]
files_modified:
  - src/app/actions/comandos.ts
  - src/lib/domain/robot-jobs.ts
autonomous: true

must_haves:
  truths:
    - "If inngest.send() fails, the job is marked as 'failed' and the user sees a clear error -- no orphaned pending jobs"
    - "executeBuscarGuiasCoord does not crash on null tracking_number or missing item match"
    - "executeLeerGuias uses the domain layer for job/item creation, not raw Supabase inserts"
    - "Active job race condition returns a helpful error instead of creating duplicate jobs"
  artifacts:
    - path: "src/app/actions/comandos.ts"
      provides: "Hardened server actions with try-catch inngest.send, safe access, domain refactor"
      contains: "catch (sendError)"
    - path: "src/lib/domain/robot-jobs.ts"
      provides: "createOcrRobotJob domain function for OCR jobs (null order_id)"
      contains: "createOcrRobotJob"
  key_links:
    - from: "src/app/actions/comandos.ts"
      to: "inngest.send"
      via: "try-catch wrapper with job cleanup on failure"
      pattern: "catch \\(sendError\\)"
    - from: "src/app/actions/comandos.ts"
      to: "src/lib/domain/robot-jobs.ts"
      via: "createOcrRobotJob for executeLeerGuias"
      pattern: "createOcrRobotJob"
---

<objective>
Harden all 6 server actions in comandos.ts: wrap inngest.send() in try-catch with job cleanup, fix unsafe non-null assertions, refactor executeLeerGuias to use the domain layer, and add basic tracking number format validation.

Purpose: Fixes P0 Bug #2 (orphaned jobs), P1 Bugs #7 (null assertion crash), #8 (active job race), #10 (domain bypass), and P2 Bug #18 (tracking validation). These are the most user-visible bugs -- when inngest.send fails, the user sees a frozen "pending" job forever; when buscarGuias hits a null tracking_number, the entire action crashes.

Output: Updated comandos.ts with all 6 actions hardened, plus a new createOcrRobotJob domain function in robot-jobs.ts.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/robot-coordinadora-hardening/RESEARCH.md
@src/app/actions/comandos.ts
@src/lib/domain/robot-jobs.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add createOcrRobotJob to domain layer + wrap all inngest.send in try-catch</name>
  <files>src/lib/domain/robot-jobs.ts, src/app/actions/comandos.ts</files>
  <action>
**Part A: Add `createOcrRobotJob` to robot-jobs.ts**

Add a new exported function after `createRobotJob`:

```typescript
export interface CreateOcrRobotJobParams {
  /** Number of image files to process */
  fileCount: number
}

export interface CreateOcrRobotJobResult {
  jobId: string
  itemIds: string[]
}

/**
 * Create a robot job for OCR guide reading.
 * OCR items have order_id = NULL (images, not orders).
 * Uses domain layer pattern (workspace_id filter, admin client).
 */
export async function createOcrRobotJob(
  ctx: DomainContext,
  params: CreateOcrRobotJobParams
): Promise<DomainResult<CreateOcrRobotJobResult>> {
  const supabase = createAdminClient()

  try {
    if (params.fileCount <= 0) {
      return { success: false, error: 'Se requiere al menos un archivo' }
    }

    // Insert robot_jobs row
    const { data: job, error: jobError } = await supabase
      .from('robot_jobs')
      .insert({
        workspace_id: ctx.workspaceId,
        carrier: 'multi',
        job_type: 'ocr_guide_read',
        total_items: params.fileCount,
      })
      .select('id')
      .single()

    if (jobError || !job) {
      return { success: false, error: `Error creando job de OCR: ${jobError?.message}` }
    }

    // Insert items with order_id = NULL
    const itemsToInsert = Array.from({ length: params.fileCount }, () => ({
      job_id: job.id,
      order_id: null,
    }))

    const { data: items, error: itemsError } = await supabase
      .from('robot_job_items')
      .insert(itemsToInsert)
      .select('id')

    if (itemsError || !items) {
      // Rollback job
      await supabase.from('robot_jobs').delete().eq('id', job.id)
      return { success: false, error: `Error creando items de OCR: ${itemsError?.message}` }
    }

    return {
      success: true,
      data: {
        jobId: job.id,
        itemIds: items.map(i => i.id),
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}
```

Export it from robot-jobs.ts.

**Part B: Wrap all inngest.send() calls in try-catch in comandos.ts**

Import `updateJobStatus` from robot-jobs.ts (add to existing import). Also import `createOcrRobotJob`.

For ALL 6 action functions that call inngest.send() (`executeSubirOrdenesCoord`, `executeBuscarGuiasCoord`, `executeLeerGuias`, `executeGenerarGuiasInter`, `executeGenerarGuiasBogota`, `executeGenerarExcelEnvia`), wrap the `await (inngest.send as any)({...})` call in:

```typescript
try {
  await (inngest.send as any)({
    name: '...',
    data: { ... },
  })
} catch (sendError) {
  console.error(`[comandos] Inngest send failed for job ${jobId}:`, sendError)
  try {
    await updateJobStatus(ctx, { jobId, status: 'failed' })
  } catch (cleanupError) {
    console.error(`[comandos] Job cleanup also failed:`, cleanupError)
  }
  return {
    success: false,
    error: 'Error iniciando el procesamiento. El job fue cancelado. Intente nuevamente.',
  }
}
```

For each action, use the appropriate jobId variable:
- `executeSubirOrdenesCoord`: `jobResult.data.jobId`
- `executeBuscarGuiasCoord`: `jobResult.data.jobId`
- `executeLeerGuias`: `ocrResult.data.jobId` (after refactor)
- `executeGenerarGuiasInter`: `jobResult.data.jobId`
- `executeGenerarGuiasBogota`: `jobResult.data.jobId`
- `executeGenerarExcelEnvia`: `jobResult.data.jobId`
  </action>
  <verify>
1. Grep for `catch (sendError)` in comandos.ts -- should find exactly 6 matches (one per action)
2. Grep for `updateJobStatus(ctx, { jobId` in comandos.ts -- should find 6 cleanup calls
3. Grep for `createOcrRobotJob` in robot-jobs.ts -- should find the function definition
4. Run `npx tsc --noEmit` to verify TypeScript compilation
  </verify>
  <done>
All 6 inngest.send() calls are wrapped in try-catch. On failure, the job is marked as 'failed' and the user gets a clear error message. createOcrRobotJob domain function exists.
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix safe access, refactor executeLeerGuias, handle active job race</name>
  <files>src/app/actions/comandos.ts</files>
  <action>
**Fix 1: Bug #7 -- Safe access in executeBuscarGuiasCoord (around line 375)**

Replace the unsafe non-null assertions in the pedidoNumbers mapping:

```typescript
// OLD (crashes on null):
pedidoNumbers: orders.map(order => {
  const item = jobResult.data!.items.find(i => i.orderId === order.id)!
  return {
    itemId: item.itemId,
    orderId: order.id,
    pedidoNumber: order.tracking_number,  // Could be null
  }
})

// NEW (safe access with filter):
pedidoNumbers: orders
  .map(order => {
    const item = jobResult.data?.items.find(i => i.orderId === order.id)
    if (!item || !order.tracking_number) return null
    return {
      itemId: item.itemId,
      orderId: order.id,
      pedidoNumber: order.tracking_number,
    }
  })
  .filter((p): p is NonNullable<typeof p> => p !== null)
```

If the filtered array is empty (all orders lack tracking numbers), return an error:
```typescript
// Add after filtering -- before inngest.send
const pedidoNumbers = orders
  .map(order => { /* ... as above ... */ })
  .filter((p): p is NonNullable<typeof p> => p !== null)

if (pedidoNumbers.length === 0) {
  return { success: false, error: 'Ninguna orden tiene numero de pedido asignado' }
}
```

**Fix 2: Bug #10 -- Refactor executeLeerGuias to use domain layer**

Replace the raw Supabase inserts (lines 503-537) with:

```typescript
// Replace raw inserts with domain function
const ocrResult = await createOcrRobotJob(ctx, { fileCount: uploadedItems.length })
if (!ocrResult.success || !ocrResult.data) {
  return { success: false, error: ocrResult.error || 'Error creando job de OCR' }
}
```

Update the inngest.send data to use `ocrResult.data.jobId` and `ocrResult.data.itemIds`:
```typescript
data: {
  jobId: ocrResult.data.jobId,
  workspaceId: ctx.workspaceId,  // Use ctx instead of auth.workspaceId
  items: uploadedItems.map((item, idx) => ({
    itemId: ocrResult.data!.itemIds[idx],
    imageUrl: item.imageUrl,
    mimeType: item.mimeType,
    fileName: item.fileName,
  })),
  matchStageId: ocrStageResult.data.stageId,
}
```

Remove the `createAdminClient` import that was only needed for the raw inserts (it should no longer be used in this function). Remove the manual `crypto.randomUUID()` calls. Remove the raw `supabase.from('robot_jobs').insert(...)` and `supabase.from('robot_job_items').insert(...)` blocks.

Also update the return to use `ocrResult.data`:
```typescript
return {
  success: true,
  data: {
    jobId: ocrResult.data.jobId,
    totalFiles: uploadedItems.length,
  },
}
```

Note: Keep the `createAdminClient` import at the top of the file only if it's used elsewhere. If `executeLeerGuias` was the only user, the dynamic import `await import('@/lib/supabase/admin')` inside the function can be removed entirely. Check if the storage upload still needs it -- it does (for file upload). The storage upload uses a dynamic import inside the function, which is fine. The key change is removing the raw DB inserts and using the domain function instead.

**Fix 3: Bug #8 -- Active job race condition**

No code change needed for the race condition itself (it's a check-then-act pattern that can't be made fully atomic without DB constraints). But make the error message more helpful when a duplicate is detected. The current messages are fine:
- "Ya hay un job activo en progreso"
- "Ya hay una busqueda de guias en progreso"
- etc.

These are already clear. No change needed here -- the research confirmed that the DB idempotency_key provides a safety net if race conditions occur.

**Fix 4: Bug #18 -- Basic tracking number format validation**

In `executeBuscarGuiasCoord`, after filtering orders with tracking numbers, add basic validation:

```typescript
// After the pedidoNumbers filter, validate format
const invalidTrackingOrders = pedidoNumbers.filter(
  p => p.pedidoNumber.length < 3 || p.pedidoNumber.length > 50
)
if (invalidTrackingOrders.length > 0) {
  console.warn(`[comandos] ${invalidTrackingOrders.length} orders with suspicious tracking numbers, proceeding anyway`)
  // Don't block -- just warn. Robot service will handle invalid numbers.
}
```

This is a soft validation (warn, don't block) since tracking number formats vary by carrier.
  </action>
  <verify>
1. Grep for `!.items.find` in comandos.ts -- should find 0 matches (unsafe assertions removed)
2. Grep for `createOcrRobotJob` in comandos.ts -- should find the import and usage
3. Grep for `crypto.randomUUID()` in comandos.ts -- should find 0 matches (replaced by domain function)
4. Grep for `supabase.from('robot_jobs').insert` in comandos.ts -- should find 0 matches (replaced by domain)
5. Grep for `supabase.from('robot_job_items').insert` in comandos.ts -- should find 0 matches
6. Run `npx tsc --noEmit` to verify TypeScript compilation
  </verify>
  <done>
executeBuscarGuiasCoord has safe access (no crash on null tracking_number). executeLeerGuias uses createOcrRobotJob domain function instead of raw Supabase inserts. Active job race condition has clear error messages. Basic tracking number format validation warns on suspicious values.
  </done>
</task>

</tasks>

<verification>
1. No non-null assertions (`!`) on potentially null data in comandos.ts
2. All inngest.send() calls have try-catch with job cleanup
3. executeLeerGuias routes through domain layer (no raw inserts)
4. TypeScript compiles without errors
5. createOcrRobotJob is properly exported from robot-jobs.ts
</verification>

<success_criteria>
- P0 Bug #2 (orphaned jobs on inngest.send failure) is fixed -- try-catch + cleanup on all 6 actions
- P1 Bug #7 (non-null assertion crash) is fixed -- safe access with filter
- P1 Bug #8 (active job race) -- already handled gracefully, messages confirmed clear
- P1 Bug #10 (executeLeerGuias domain bypass) is fixed -- uses createOcrRobotJob
- P2 Bug #18 (tracking number validation) -- soft validation with warning
- Code compiles with `npx tsc --noEmit`
</success_criteria>

<output>
After completion, create `.planning/standalone/robot-coordinadora-hardening/hardening-03-SUMMARY.md`
</output>
