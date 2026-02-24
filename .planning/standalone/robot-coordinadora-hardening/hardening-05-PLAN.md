---
phase: robot-coordinadora-hardening
plan: 05
type: execute
wave: 1
depends_on: []
files_modified:
  - src/hooks/use-robot-job-progress.ts
  - src/app/(dashboard)/comandos/components/comandos-layout.tsx
autonomous: true

must_haves:
  truths:
    - "UI shows a warning banner when Realtime subscription is disconnected"
    - "Document URL for PDF/Excel results is never empty due to async race condition"
    - "useRobotJobProgress exposes isDisconnected boolean for UI consumption"
  artifacts:
    - path: "src/hooks/use-robot-job-progress.ts"
      provides: "Realtime hook with disconnect detection"
      contains: "isDisconnected"
    - path: "src/app/(dashboard)/comandos/components/comandos-layout.tsx"
      provides: "Fixed async race in document URL completion effect"
      contains: "setIsExecuting(false)"
  key_links:
    - from: "src/hooks/use-robot-job-progress.ts"
      to: "Supabase Realtime .subscribe() callback"
      via: "status tracking for disconnect detection"
      pattern: "isDisconnected"
    - from: "src/app/(dashboard)/comandos/components/comandos-layout.tsx"
      to: "src/hooks/use-robot-job-progress.ts"
      via: "consuming isDisconnected state"
      pattern: "isDisconnected"
---

<objective>
Add Realtime disconnect detection to the progress hook and fix the async race condition in the comandos-layout completion effect for document URLs.

Purpose: Fixes P2 Bug #11 (no Realtime disconnect detection) and P2 Bug #17 (async race in document URL). When the Realtime subscription disconnects (network issue, Supabase maintenance), the user sees a frozen progress bar with no indication that updates have stopped. The document URL race happens because setIsExecuting(false) runs before the async getJobItemsForHistory completes, potentially losing the document URL.

Output: Updated use-robot-job-progress.ts with disconnect state + updated comandos-layout.tsx with race fix and disconnect warning.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/robot-coordinadora-hardening/RESEARCH.md
@src/hooks/use-robot-job-progress.ts
@src/app/(dashboard)/comandos/components/comandos-layout.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add disconnect detection to useRobotJobProgress</name>
  <files>src/hooks/use-robot-job-progress.ts</files>
  <action>
1. Add `isDisconnected` state:
```typescript
const [isDisconnected, setIsDisconnected] = useState(false)
```

2. Reset disconnect state when jobId changes (in the initial data fetch effect):
```typescript
// At the start of the jobId effect
if (!jobId) {
  setJob(null)
  setItems([])
  setIsLoading(false)
  setIsDisconnected(false)  // Add this
  return
}
```

3. Update the `.subscribe()` callback in the Realtime subscription effect to track connection status:
```typescript
.subscribe((status, err) => {
  if (status === 'SUBSCRIBED') {
    setIsDisconnected(false)
  } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
    setIsDisconnected(true)
    console.error(`[useRobotJobProgress] Realtime ${status}:`, err)
  }
})
```

The Supabase Realtime client uses these status values:
- `SUBSCRIBED` -- connected and receiving events
- `CHANNEL_ERROR` -- connection failed
- `TIMED_OUT` -- subscription timed out
- `CLOSED` -- channel was closed

4. Add `isDisconnected` to the return type and return object:
```typescript
export function useRobotJobProgress(jobId: string | null): {
  job: RobotJob | null
  items: RobotJobItem[]
  successCount: number
  errorCount: number
  totalItems: number
  isComplete: boolean
  isLoading: boolean
  isDisconnected: boolean  // Add this
} {
  // ...
  return {
    job,
    items,
    successCount,
    errorCount,
    totalItems,
    isComplete,
    isLoading,
    isDisconnected,  // Add this
  }
}
```
  </action>
  <verify>
1. Grep for `isDisconnected` in use-robot-job-progress.ts -- should find state declaration, reset, setter calls, and return
2. Grep for `CHANNEL_ERROR` in use-robot-job-progress.ts -- should find the status check
3. Run `npx tsc --noEmit` to verify TypeScript compilation
  </verify>
  <done>
useRobotJobProgress exposes isDisconnected boolean. It becomes true when Realtime enters CHANNEL_ERROR, TIMED_OUT, or CLOSED states, and resets to false on SUBSCRIBED.
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix async race in document URL + show disconnect warning</name>
  <files>src/app/(dashboard)/comandos/components/comandos-layout.tsx</files>
  <action>
**Fix 1: Bug #17 -- Async race in document URL completion**

In the completion detection effect (around line 188), the PDF/Excel branch currently does:
```typescript
// Reset state immediately (don't wait for async)
setActiveJobId(null)
setActiveJobType(null)
setIsExecuting(false)  // BUG: This runs before getJobItemsForHistory resolves
prevProcessedRef.current = 0
```

The problem: `setIsExecuting(false)` re-enables the input immediately, but the document URL message hasn't been added yet (it's inside the `.then()` callback). This isn't a data-loss bug but it's a UX issue -- the user can type a new command while the result is still loading.

Fix: Move `setIsExecuting(false)` into the `.then()` callback, AFTER the message is added:

```typescript
if (['pdf_guide_inter', 'pdf_guide_bogota', 'excel_guide_envia'].includes(activeJobType ?? '')) {
  const jobType = activeJobType!
  const jobIdCopy = activeJobId

  // Reset job tracking immediately (stops Realtime subscription)
  setActiveJobId(null)
  setActiveJobType(null)
  prevProcessedRef.current = 0
  // NOTE: setIsExecuting(false) moved into .then() to prevent input race

  getJobItemsForHistory(jobIdCopy).then((finalResult) => {
    const finalItems = finalResult.success && finalResult.data ? finalResult.data : items
    const finalSuccessCount = finalItems.filter(i => i.status === 'success').length

    const successItem = finalItems.find(i => i.status === 'success' && i.value_sent)
    const documentUrl = (successItem?.value_sent as any)?.documentUrl
    const isExcel = jobType === 'excel_guide_envia'
    const carrierNames: Record<string, string> = {
      'pdf_guide_inter': 'Inter Rapidisimo',
      'pdf_guide_bogota': 'Bogota',
      'excel_guide_envia': 'Envia',
    }
    addMessage({
      type: 'document_result',
      documentUrl: documentUrl || '',
      documentType: isExcel ? 'excel' : 'pdf',
      totalOrders: finalSuccessCount,
      carrierName: carrierNames[jobType] || jobType,
      timestamp: now(),
    })
    loadHistory()
    setIsExecuting(false)  // NOW safe -- message has been added
  }).catch(() => {
    // Fallback: still re-enable input even if fetch fails
    setIsExecuting(false)
  })

  prevIsCompleteRef.current = isComplete
  return
}
```

**Fix 2: Bug #11 -- Show disconnect warning in UI**

1. Destructure `isDisconnected` from the hook:
```typescript
const { job, items, successCount, errorCount, totalItems, isComplete, isDisconnected } =
  useRobotJobProgress(activeJobId)
```

2. Add a disconnect warning in the JSX, right after the header bar and before the ComandosSplitPanel:
```typescript
{isDisconnected && activeJobId && (
  <div className="px-6 py-2 bg-yellow-500/10 border-b border-yellow-500/20 text-yellow-600 dark:text-yellow-400 text-sm flex items-center gap-2">
    <span className="inline-block w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
    Conexion en tiempo real interrumpida. El progreso puede no actualizarse.
  </div>
)}
```

Place this between the header `<div className="h-14 ...">` and the `<div className="flex-1 min-h-0">` container.
  </action>
  <verify>
1. Grep for `isDisconnected` in comandos-layout.tsx -- should find destructuring and JSX usage
2. Grep for `Conexion en tiempo real` in comandos-layout.tsx -- should find the warning text
3. Verify that `setIsExecuting(false)` appears INSIDE the `.then()` callback for the document branch
4. Run `npx tsc --noEmit` to verify TypeScript compilation
  </verify>
  <done>
Document URL completion waits for async fetch before re-enabling input. Disconnect warning banner appears when Realtime is interrupted during an active job.
  </done>
</task>

</tasks>

<verification>
1. useRobotJobProgress returns isDisconnected boolean
2. Disconnect detection uses Supabase Realtime status callback
3. comandos-layout shows yellow warning banner when disconnected during active job
4. setIsExecuting(false) runs after document URL message is added (inside .then())
5. TypeScript compiles without errors
</verification>

<success_criteria>
- P2 Bug #11 (Realtime disconnect) is fixed -- isDisconnected state exposed, yellow warning banner shown
- P2 Bug #17 (async race in document URL) is fixed -- setIsExecuting(false) moved inside .then()
- Code compiles with `npx tsc --noEmit`
</success_criteria>

<output>
After completion, create `.planning/standalone/robot-coordinadora-hardening/hardening-05-SUMMARY.md`
</output>
