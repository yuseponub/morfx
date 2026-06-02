---
phase: godentist-followup-ultimatum
plan: 03
type: execute
wave: 2
depends_on: ["01", "02"]
files_modified:
  - src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx
autonomous: false

must_haves:
  truths:
    - "User can see followup status in history detail view"
    - "User can see which patients received ultimatum vs were skipped vs failed"
    - "Followup section only appears when followup_results exist"
  artifacts:
    - path: "src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx"
      provides: "Followup results display in HistoryDetail"
      contains: "followup_results"
  key_links:
    - from: "src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx"
      to: "src/app/actions/godentist.ts"
      via: "imports FollowupResult type and reads followup_results from ScrapeHistoryEntry"
      pattern: "FollowupResult"
---

<objective>
Show followup/ultimatum results in the confirmaciones panel history detail view.

Purpose: User needs to see which patients received the 2pm ultimatum, which were skipped (responded), and which failed.
Output: Updated UI showing followup status in the history detail.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx
@src/app/actions/godentist.ts
@.planning/standalone/godentist-followup-ultimatum/01-SUMMARY.md
@.planning/standalone/godentist-followup-ultimatum/02-SUMMARY.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add followup results section to HistoryDetail</name>
  <files>src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx</files>
  <action>
1. Import `FollowupResult` from `@/app/actions/godentist` (add to existing import line that already imports ScrapeHistoryEntry, SendResult, etc.).

2. In the `HistoryDetail` component (line ~987), AFTER the send_results section (after the closing `</>` of the `{entry.send_results && (...)}` block, around line ~1105), add a followup results section:

```tsx
{/* Followup results (2pm ultimatum) */}
{entry.followup_results && entry.followup_results.length > 0 && (
  <>
    <p className="text-sm font-medium mt-4">
      Seguimiento 2PM ({new Date(entry.followup_sent_at!).toLocaleString('es-CO', { timeZone: 'America/Bogota' })})
    </p>
    <div className="grid grid-cols-3 gap-2">
      <Card>
        <CardContent className="pt-4 text-center">
          <p className="text-2xl font-bold text-green-600">
            {entry.followup_results.filter(r => r.status === 'sent').length}
          </p>
          <p className="text-xs text-muted-foreground">Ultimatum enviado</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 text-center">
          <p className="text-2xl font-bold text-blue-600">
            {entry.followup_results.filter(r => r.status === 'skipped').length}
          </p>
          <p className="text-xs text-muted-foreground">Ya respondieron</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 text-center">
          <p className="text-2xl font-bold text-red-600">
            {entry.followup_results.filter(r => r.status === 'failed').length}
          </p>
          <p className="text-xs text-muted-foreground">Fallidos</p>
        </CardContent>
      </Card>
    </div>

    {/* Detail list */}
    <Card>
      <CardContent className="pt-4">
        <ul className="space-y-1 text-sm">
          {entry.followup_results.map((r, i) => (
            <li key={i} className="flex items-center gap-2">
              {r.status === 'sent' && <Send className="h-3 w-3 text-green-600" />}
              {r.status === 'skipped' && <CheckCircle2 className="h-3 w-3 text-blue-600" />}
              {r.status === 'failed' && <XCircle className="h-3 w-3 text-red-600" />}
              <span>{r.nombre}</span>
              <span className="text-muted-foreground">({r.telefono})</span>
              {r.reason && (
                <span className="text-xs text-muted-foreground italic">— {r.reason}</span>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  </>
)}
```

3. Also add a small followup badge in the history LIST view (around line ~700, inside the history entry card). After the send_results info, add:
```tsx
{entry.followup_sent_at && (
  <Badge variant="outline" className="text-xs">
    Seguimiento: {entry.followup_results?.filter(r => r.status === 'sent').length || 0} enviados
  </Badge>
)}
```

Icons `Send`, `CheckCircle2`, `XCircle` are already imported at the top of the file.
  </action>
  <verify>
    - `grep "followup_results" src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx` finds the UI sections
    - `grep "Seguimiento 2PM" src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx` finds the heading
    - `npx tsc --noEmit` passes
  </verify>
  <done>History detail shows followup results with sent/skipped/failed counts and per-patient detail list. History list shows followup badge.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Complete GoDentist 2PM followup/ultimatum system: Inngest function that checks patient responses and sends conservacion_cita template, triggered automatically from sendConfirmations, with UI showing followup status in history.</what-built>
  <how-to-verify>
    1. Apply migration in production (followup_results + followup_sent_at columns)
    2. Push code to Vercel
    3. Test flow:
       a. Send confirmations to a test patient before 2pm Colombia time
       b. Verify in Inngest dashboard that `godentist/followup.check` event was fired with scheduledAt = 19:00 UTC today
       c. Wait until 2pm (or manually trigger the Inngest function from dashboard for testing)
       d. Check that non-responding patients receive `conservacion_cita` WhatsApp template
       e. Check history detail view shows "Seguimiento 2PM" section with results
    4. Verify time guard: if you send confirmations after 2pm, no followup event should be fired (check console logs)
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues</resume-signal>
</task>

</tasks>

<verification>
- UI shows followup results only when data exists (no empty section)
- Stats cards show correct counts for sent/skipped/failed
- Per-patient list shows icons and reasons
- History list badge shows followup count
- `npx tsc --noEmit` passes
</verification>

<success_criteria>
- Followup status visible in history detail with sent/skipped/failed breakdown
- Badge visible in history list view
- No type errors
- Full flow works end-to-end: send confirmations -> 2pm check -> ultimatum sent -> results visible in UI
</success_criteria>

<output>
After completion, create `.planning/standalone/godentist-followup-ultimatum/03-SUMMARY.md`
</output>
