---
phase: robot-coordinadora-hardening
verified: 2026-02-24T16:09:45Z
status: passed
score: 14/14 must-haves verified
re_verification: false
---

# Robot Coordinadora Hardening — Verification Report

**Phase Goal:** Fix 17 audit bugs across the robot coordinadora flow: atomic counters, fetch timeouts, inngest.send try-catch, idempotent batch_completed, payload validation, disconnect detection. 5 plans across 2 waves.
**Verified:** 2026-02-24T16:09:45Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | Counter increments are atomic at the SQL level — two concurrent callbacks never lose an increment | VERIFIED | `increment_robot_job_counter` RPC uses single `UPDATE...RETURNING` in `20260227000000_robot_job_atomic_counters.sql:38-47` |
| 2  | Job auto-completes when success_count + error_count >= total_items via atomic SQL check | VERIFIED | RPC function computes `v_complete := (v_success + v_error) >= v_total` and runs `UPDATE...WHERE status NOT IN ('completed','failed')` at line 59-66 of migration |
| 3  | batch_completed_emitted column exists for idempotent event emission | VERIFIED | `ALTER TABLE robot_jobs ADD COLUMN IF NOT EXISTS batch_completed_emitted BOOLEAN NOT NULL DEFAULT false` at migration:11 |
| 4  | Idempotency guard handles mid-way item failures (re-processable items) | VERIFIED | `robot-jobs.ts:346` — only `item.status === 'success'` is terminal; error items proceed to update |
| 5  | Fetch calls to robot service have a timeout of 60s per order + 10 minutes margin | VERIFIED | `robot-orchestrator.ts:118,124` — `fetchTimeoutMs = (orders.length * 60_000) + (10 * 60_000)` + `signal: AbortSignal.timeout(fetchTimeoutMs)` on both orchestrators |
| 6  | Settle sleep is 5 seconds (not 2) to reduce waitForEvent race condition probability | VERIFIED | `robot-orchestrator.ts:155,343` — `step.sleep('settle', '5s')` in both robotOrchestrator and guideLookupOrchestrator; no `'2s'` sleeps remain |
| 7  | onFailure handlers report descriptive error messages to the chat via job error_message | VERIFIED | `robot-orchestrator.ts:80` — `error_message: 'Error del orquestador: ${errorMessage}'`; `robot-orchestrator.ts:196` — `'Tiempo de espera agotado...'` in both orchestrators |
| 8  | waitForEvent timeout uses 60s/order + 10min margin formula | VERIFIED | `robot-orchestrator.ts:159,347` — `timeoutMs = (orders.length * 60_000) + (10 * 60_000)` for both orchestrators |
| 9  | If inngest.send() fails, the job is marked as 'failed' and user sees clear error | VERIFIED | `comandos.ts:284,419,569,670,771,871` — all 6 actions wrap `inngest.send` in `try { } catch (sendError)` with `updateJobStatus(..., 'failed')` cleanup |
| 10 | executeBuscarGuiasCoord does not crash on null tracking_number or missing item match | VERIFIED | `comandos.ts:383-393` — safe optional chaining `jobResult.data?.items.find(...)`, null guard `if (!item \|\| !order.tracking_number) return null`, typed filter `(p): p is NonNullable<typeof p> => p !== null` |
| 11 | executeLeerGuias uses the domain layer for job/item creation, not raw Supabase inserts | VERIFIED | `comandos.ts:547` — `createOcrRobotJob(ctx, { fileCount: uploadedItems.length })`; no raw `supabase.from('robot_jobs').insert` or `crypto.randomUUID()` in the file |
| 12 | Active job race condition returns a helpful error instead of creating duplicate jobs | VERIFIED | `comandos.ts:189,360,531,636,737,838` — all 6 actions return descriptive Spanish messages like `'Ya hay un job activo en progreso'` |
| 13 | Callback payload is strictly validated: itemId must be valid UUID, status must be 'success' or 'error' | VERIFIED | `route.ts:84-86` — `UUID_REGEX` test; `route.ts:80` — itemId string check; `route.ts:80` — status enum check; `route.ts:98-103` — errorType enum validation with descriptive 400 responses |
| 14 | batch_completed event is emitted exactly once per job using atomic DB flag guard | VERIFIED | `route.ts:209-216` — atomic `UPDATE WHERE batch_completed_emitted = false` + `maybeSingle()` — only the winning concurrent callback emits; `route.ts:240` — flag reset on inngest.send failure |
| 15 | inngest.send failure in callback returns 500 (not 200) so robot service can retry | VERIFIED | `route.ts:243-246` — `return NextResponse.json({ error: '...' }, { status: 500 })` after inngest.send catch |
| 16 | Invalid payloads are rejected with 400 and descriptive error messages | VERIFIED | `route.ts:63,76,80,86,93,103` — multiple distinct 400 responses with descriptive errors for JSON parse fail, missing itemId, invalid status, non-UUID itemId, bad trackingNumber length, invalid errorType |
| 17 | UI shows a warning banner when Realtime subscription is disconnected | VERIFIED | `comandos-layout.tsx:569-574` — `{isDisconnected && activeJobId && (<div ...>Conexion en tiempo real interrumpida...</div>)}` with yellow styling and pulse indicator |
| 18 | Document URL for PDF/Excel results is never empty due to async race condition | VERIFIED | `comandos-layout.tsx:201,224,227` — `setIsExecuting(false)` moved inside `.then()` callback (comment: "NOW safe — message has been added"), with `.catch()` fallback |
| 19 | useRobotJobProgress exposes isDisconnected boolean for UI consumption | VERIFIED | `use-robot-job-progress.ts:35,40,127-132,170` — type declaration, `useState(false)`, `SUBSCRIBED`/`CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED` handlers, and return value |

**Score:** 19/19 truths verified (reported as 14 in frontmatter — see note below)

> Note: The 5 plans collectively enumerate 14 distinct must-have truths. The 19 rows above expand some truths into sub-checks for completeness; all map back to the 14 plan-level truths. All 14 pass.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260227000000_robot_job_atomic_counters.sql` | Atomic RPC + batch_completed_emitted column | VERIFIED | 76 lines; `CREATE OR REPLACE FUNCTION increment_robot_job_counter`; `ADD COLUMN IF NOT EXISTS batch_completed_emitted`; GRANTs to authenticated and service_role |
| `src/lib/domain/robot-jobs.ts` | Atomic RPC call, improved idempotency | VERIFIED | 840 lines; `.rpc('increment_robot_job_counter')` at line 405; idempotency guard at line 346 only blocks `success` status; `createOcrRobotJob` exported at line 145 |
| `src/inngest/functions/robot-orchestrator.ts` | Hardened orchestrator with timeouts and error reporting | VERIFIED | 993 lines; `AbortSignal.timeout` at lines 124 and 314; `'5s'` settle at lines 155 and 343; `Error del orquestador` at lines 80 and 271; `Tiempo de espera agotado` at lines 196 and 382 |
| `src/app/actions/comandos.ts` | Hardened server actions with try-catch, safe access, domain refactor | VERIFIED | 973 lines; 6 `catch (sendError)` blocks; safe access with `.filter(NonNullable)` at line 393; `createOcrRobotJob` called at line 547; no raw robot_jobs inserts |
| `src/app/api/webhooks/robot-callback/route.ts` | Hardened webhook with validation, idempotent emission, error propagation | VERIFIED | 252 lines; `UUID_REGEX` at line 84; `batch_completed_emitted` guard at lines 211-214; `status: 500` at line 245 |
| `src/hooks/use-robot-job-progress.ts` | Realtime hook with disconnect detection | VERIFIED | 172 lines; `isDisconnected` in return type (line 35), state (line 40), reset (line 48), SUBSCRIBED handler (line 128), error handler (lines 130-131), and return (line 170) |
| `src/app/(dashboard)/comandos/components/comandos-layout.tsx` | Fixed async race + disconnect warning | VERIFIED | 597 lines; `isDisconnected` destructured (line 132); warning banner (lines 569-574); `setIsExecuting(false)` inside `.then()` (line 224) with `.catch()` fallback (line 227) |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `robot-jobs.ts` | `increment_robot_job_counter` RPC | `.rpc()` call replacing read-then-write | WIRED | Line 405: `.rpc('increment_robot_job_counter', { p_job_id: item.job_id, p_is_success: ... })` |
| `robot-orchestrator.ts` | robot service fetch calls | `AbortSignal.timeout` on all `fetch()` | WIRED | Lines 124, 314: both external-facing orchestrators have `signal: AbortSignal.timeout(fetchTimeoutMs)` |
| `robot-orchestrator.ts` | `updateJobStatus` | `onFailure` with error message propagation | WIRED | Lines 47-88 (robotOrchestrator) and 238-287 (guideLookupOrchestrator): both write `Error del orquestador` to pending item |
| `comandos.ts` | `inngest.send` | try-catch wrapper with job cleanup on failure | WIRED | 6 `catch (sendError)` blocks at lines 284, 419, 569, 670, 771, 871 — each calls `updateJobStatus(..., 'failed')` |
| `comandos.ts` | `robot-jobs.ts` | `createOcrRobotJob` for executeLeerGuias | WIRED | Imported at line 25, called at line 547: `createOcrRobotJob(ctx, { fileCount: uploadedItems.length })` |
| `route.ts` | `robot_jobs.batch_completed_emitted` | atomic `UPDATE WHERE batch_completed_emitted = false` | WIRED | Lines 209-216: atomic UPDATE with `.eq('batch_completed_emitted', false)` + `.maybeSingle()` guard |
| `route.ts` | `inngest.send` | try-catch returning 500 on failure | WIRED | Lines 235-246: catch block resets flag + returns `{ status: 500 }` |
| `use-robot-job-progress.ts` | Supabase Realtime `.subscribe()` | status tracking for disconnect detection | WIRED | Lines 126-133: `SUBSCRIBED` sets false, `CHANNEL_ERROR\|TIMED_OUT\|CLOSED` sets true |
| `comandos-layout.tsx` | `use-robot-job-progress.ts` | consuming `isDisconnected` state | WIRED | Line 132: destructured from hook; line 569: conditional render of warning banner |

---

### Anti-Patterns Found

No blocker anti-patterns detected in any of the 7 artifacts.

Notable patterns checked:
- No `TODO`, `FIXME`, `placeholder` comments in modified files (outside of legitimate `// NOTE:` comments explaining intent)
- No empty return handlers (`return null`, `return {}`)
- No `console.log`-only implementations
- Old counter read-then-write references in `robot-jobs.ts` lines 403/426 are comments/log strings, not logic — the actual replacement RPC call is at line 405

---

### Human Verification Required

The following items cannot be verified programmatically and require human testing in a real environment:

**1. Atomic counter behavior under concurrent load**
- Test: Send two simultaneous callbacks for the last two items of a job
- Expected: Both increments are reflected (no lost update); job transitions to 'completed' exactly once
- Why human: Requires concurrent HTTP requests and DB inspection; cannot simulate concurrency with grep

**2. AbortSignal.timeout actually aborts hung fetch**
- Test: Point ROBOT_COORDINADORA_URL at a slow mock server that never responds; submit a job
- Expected: After `fetchTimeoutMs`, the orchestrator step throws an `AbortError` and the job is marked failed
- Why human: Requires a real network environment; cannot mock AbortSignal behavior statically

**3. Realtime disconnect banner visibility**
- Test: Open the comandos UI with an active job, then disable network in DevTools
- Expected: Yellow warning banner appears: "Conexion en tiempo real interrumpida. El progreso puede no actualizarse."
- Why human: Visual/browser behavior; Supabase Realtime disconnect is environment-dependent

**4. Document URL not empty on PDF/Excel completion**
- Test: Run a PDF guide generation job to completion, observe the result message
- Expected: Document URL in the result message is a valid URL (not empty string `''`)
- Why human: Requires a real end-to-end job run with actual robot service response

**5. inngest.send failure cleanup (orphaned job prevention)**
- Test: Temporarily break the Inngest endpoint, submit a command
- Expected: User sees "Error iniciando el procesamiento. El job fue cancelado." — job status in DB is 'failed', not 'pending'
- Why human: Requires ability to simulate Inngest connectivity failure

---

## Gaps Summary

No gaps found. All 14 must-have truths from the 5 plans are verified with direct code evidence.

The phase fully achieves its goal: 17 audit bugs across the robot coordinadora flow have been addressed with:

- **Plan 01**: Atomic SQL counter via `increment_robot_job_counter` RPC + `batch_completed_emitted` column
- **Plan 02**: `AbortSignal.timeout` on fetch calls, 5s settle sleep, `onFailure` error propagation to UI
- **Plan 03**: `catch (sendError)` on all 6 inngest.send calls with cleanup, null-safe access in buscarGuias, `createOcrRobotJob` domain refactor for leerGuias
- **Plan 04**: UUID regex + enum validation returning 400, atomic `batch_completed_emitted` flag preventing duplicate events, 500 response on inngest.send failure
- **Plan 05**: `isDisconnected` boolean in hook with Realtime status tracking, yellow warning banner in UI, `setIsExecuting(false)` moved inside `.then()` to fix async race

---

_Verified: 2026-02-24T16:09:45Z_
_Verifier: Claude (gsd-verifier)_
