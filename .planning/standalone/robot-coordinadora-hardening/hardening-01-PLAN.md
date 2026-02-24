---
phase: robot-coordinadora-hardening
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/20260227000000_robot_job_atomic_counters.sql
  - src/lib/domain/robot-jobs.ts
autonomous: true

must_haves:
  truths:
    - "Counter increments are atomic at the SQL level -- two concurrent callbacks never lose an increment"
    - "Job auto-completes when success_count + error_count >= total_items via atomic SQL check"
    - "batch_completed_emitted column exists for idempotent event emission"
    - "Idempotency guard handles mid-way item failures (re-processable items)"
  artifacts:
    - path: "supabase/migrations/20260227000000_robot_job_atomic_counters.sql"
      provides: "increment_robot_job_counter RPC + batch_completed_emitted column"
      contains: "CREATE OR REPLACE FUNCTION increment_robot_job_counter"
    - path: "src/lib/domain/robot-jobs.ts"
      provides: "Atomic counter updates via RPC, improved idempotency"
      contains: "rpc('increment_robot_job_counter'"
  key_links:
    - from: "src/lib/domain/robot-jobs.ts"
      to: "increment_robot_job_counter RPC"
      via: "supabase.rpc() call replacing read-then-write"
      pattern: "\\.rpc\\('increment_robot_job_counter'"
---

<objective>
Create the SQL migration for atomic counter increment and batch_completed_emitted flag, then refactor the domain layer to use the RPC function instead of the buggy read-then-write pattern.

Purpose: Eliminates the P0 counter race condition (Bug #1) where two concurrent callbacks both read the same count, both increment by 1, and one increment is lost -- causing jobs to never complete. Also adds the DB column needed by Plan 04 for idempotent batch_completed emission (Bug #5).

Output: Migration file + updated robot-jobs.ts with atomic counters and improved idempotency guard.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/robot-coordinadora-hardening/RESEARCH.md
@src/lib/domain/robot-jobs.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: SQL migration -- atomic counter RPC + batch_completed_emitted column</name>
  <files>supabase/migrations/20260227000000_robot_job_atomic_counters.sql</files>
  <action>
Create a new migration file with:

1. **`increment_robot_job_counter` RPC function** (plpgsql):
   - Parameters: `p_job_id UUID`, `p_is_success BOOLEAN`
   - Returns TABLE: `new_success_count INTEGER, new_error_count INTEGER, total_items INTEGER, is_now_complete BOOLEAN`
   - Logic:
     a. `UPDATE robot_jobs SET success_count = CASE WHEN p_is_success THEN success_count + 1 ELSE success_count END, error_count = CASE WHEN NOT p_is_success THEN error_count + 1 ELSE error_count END WHERE id = p_job_id RETURNING success_count, error_count, total_items`
     b. Compute `v_complete := (v_success + v_error) >= v_total`
     c. If complete: `UPDATE robot_jobs SET status = 'completed', completed_at = timezone('America/Bogota', NOW()) WHERE id = p_job_id AND status NOT IN ('completed', 'failed')` (idempotent guard)
     d. Return the row
   - Use `CREATE OR REPLACE FUNCTION` for idempotency
   - Grant to `authenticated` and `service_role`

2. **`batch_completed_emitted` column** on `robot_jobs`:
   - `ALTER TABLE robot_jobs ADD COLUMN IF NOT EXISTS batch_completed_emitted BOOLEAN NOT NULL DEFAULT false;`
   - Add comment explaining its purpose

Follow existing migration naming pattern: `20260227000000_robot_job_atomic_counters.sql`
Use `IF NOT EXISTS` / `CREATE OR REPLACE` for safe re-runs (Regla 5).
  </action>
  <verify>
Read the migration file and verify:
- RPC function uses atomic UPDATE...RETURNING (single statement, not read-then-write)
- Auto-completion guard checks `status NOT IN ('completed', 'failed')` for idempotency
- batch_completed_emitted column has default false
- GRANT statements for both authenticated and service_role
  </verify>
  <done>
Migration file exists with atomic RPC function and batch_completed_emitted column, using idempotent DDL patterns.
  </done>
</task>

<task type="auto">
  <name>Task 2: Refactor updateJobItemResult to use atomic RPC + improve idempotency</name>
  <files>src/lib/domain/robot-jobs.ts</files>
  <action>
In `updateJobItemResult` function (around lines 324-357), replace the read-then-write counter pattern with:

```typescript
// Replace lines 324-357 with atomic RPC call
const { data: counterResult, error: rpcError } = await supabase
  .rpc('increment_robot_job_counter', {
    p_job_id: item.job_id,
    p_is_success: params.status === 'success',
  })
  .single()

if (rpcError) {
  console.error(`[robot-jobs] Counter increment failed for job ${item.job_id}:`, rpcError.message)
  return { success: false, error: `Error actualizando contadores: ${rpcError.message}` }
}

// counterResult.is_now_complete is set by the RPC -- no need for manual completion logic
```

Remove ALL the old code:
- The `supabase.from('robot_jobs').select('success_count, error_count, total_items')` fetch
- The `newSuccessCount` / `newErrorCount` computation
- The `allComplete` check
- The `jobUpdate` object + update call

The RPC function handles all of this atomically.

Also fix Bug #13 (idempotency for mid-way failures):
In the idempotency guard (around line 270), change the behavior so that items in `error` status CAN be re-processed (they might be retried), but items in `success` status remain terminal:

```typescript
// Idempotency guard: success items are terminal, error items can be reprocessed
if (item.status === 'success') {
  console.log(`[robot-jobs] Item ${params.itemId} already succeeded, skipping update`)
  return {
    success: true,
    data: { itemId: params.itemId, orderId: item.order_id },
  }
}
// Note: error items proceed to update (retry scenario)
```

Update the old comment "read-then-write since Supabase JS has no atomic increment" on line 324 -- it is now replaced with "Atomic counter increment via RPC".
  </action>
  <verify>
1. Grep for `rpc('increment_robot_job_counter'` in robot-jobs.ts -- should find exactly 1 match
2. Grep for `success_count, error_count, total_items` SELECT pattern in robot-jobs.ts -- should NOT find the old read-then-write pattern (the RPC handles this internally)
3. Grep for `item.status === 'success'` in the idempotency guard -- should find the updated guard that only blocks success items
4. Run `npx tsc --noEmit` to verify TypeScript compilation
  </verify>
  <done>
updateJobItemResult uses atomic RPC for counter increment (no race condition possible), auto-completion is handled by SQL, and idempotency guard allows error items to be reprocessed for retry scenarios.
  </done>
</task>

</tasks>

<verification>
1. Migration file uses `CREATE OR REPLACE FUNCTION` and `IF NOT EXISTS` for safe re-runs
2. RPC function uses single UPDATE...RETURNING (atomic, not read-then-write)
3. robot-jobs.ts calls `.rpc('increment_robot_job_counter')` instead of read-fetch-compute-write
4. No old counter pattern remains in robot-jobs.ts
5. TypeScript compiles without errors
</verification>

<success_criteria>
- P0 Bug #1 (counter race condition) is fixed by atomic SQL increment
- P1 Bug #5 (batch_completed_emitted column) is created for Plan 04
- P2 Bug #13 (mid-way item failures) is handled by updated idempotency guard
- Code compiles with `npx tsc --noEmit`
</success_criteria>

<output>
After completion, create `.planning/standalone/robot-coordinadora-hardening/hardening-01-SUMMARY.md`
</output>
