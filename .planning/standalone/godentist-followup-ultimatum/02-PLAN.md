---
phase: godentist-followup-ultimatum
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/actions/godentist.ts
autonomous: true

must_haves:
  truths:
    - "When confirmations are sent, Inngest followup event is fired for 2pm same day"
    - "If confirmations sent after 2pm Colombia, followup is NOT scheduled"
    - "Followup event contains historyId, workspaceId, and scheduledAt (19:00 UTC)"
  artifacts:
    - path: "src/app/actions/godentist.ts"
      provides: "Inngest event emission after sendConfirmations saves history"
      contains: "godentist/followup.check"
  key_links:
    - from: "src/app/actions/godentist.ts"
      to: "inngest"
      via: "(inngest.send as any) after history update"
      pattern: "inngest\\.send.*followup\\.check"
---

<objective>
Fire the Inngest followup event from sendConfirmations after saving send results to history.

Purpose: Trigger the 2pm followup check automatically when confirmations are sent in the morning.
Output: Modified sendConfirmations action that fires `godentist/followup.check` event.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/app/actions/godentist.ts
@src/inngest/events.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fire Inngest followup event from sendConfirmations</name>
  <files>src/app/actions/godentist.ts</files>
  <action>
In `sendConfirmations` function (line ~306-316), AFTER the history update block that saves send_results and sent_at, add Inngest event emission.

The code goes AFTER the `if (historyId)` block that does the `.update({ send_results, sent_at })` and BEFORE the `return { data: result }`.

Logic:
```typescript
// Schedule 2pm followup check (only if sent before 2pm Colombia time)
if (historyId && result.sent > 0) {
  try {
    // Calculate 2pm Colombia today = 19:00 UTC same day
    // Get current Colombia date
    const nowColombia = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }))
    const colombiaHour = nowColombia.getHours()

    if (colombiaHour < 14) {
      // Build 2pm Colombia today in UTC: take today's date in Colombia, set to 19:00 UTC
      const todayColombia = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' })
      const [y, m, d] = todayColombia.split('-').map(Number)
      // 2pm Colombia = 19:00 UTC (Colombia is UTC-5, no DST)
      const scheduledAt = new Date(Date.UTC(y, m - 1, d, 19, 0, 0)).toISOString()

      await (inngest.send as any)({
        name: 'godentist/followup.check',
        data: {
          historyId,
          workspaceId,
          scheduledAt,
        },
      })
      console.log(`[godentist] Followup check scheduled for ${scheduledAt}`)
    } else {
      console.log(`[godentist] Skipping followup — sent after 2pm Colombia (hour=${colombiaHour})`)
    }
  } catch (err) {
    console.error('[godentist] Failed to schedule followup:', err)
    // Non-blocking — confirmations were already sent successfully
  }
}
```

IMPORTANT:
- The `inngest` import already exists at line 10.
- Use `(inngest.send as any)` pattern — same as used elsewhere in the codebase (see MEMORY.md).
- This MUST go AFTER the history update (line ~316) because the Inngest function reads from `godentist_scrape_history` and needs the send_results to be saved first.
- The `workspaceId` variable is already available from line 172.
- Do NOT fire if `result.sent === 0` (no messages were actually sent).
- Do NOT fire if current Colombia time is >= 14:00 (2pm or later).
  </action>
  <verify>
    - `grep "followup.check" src/app/actions/godentist.ts` finds the event emission
    - `grep "colombiaHour < 14" src/app/actions/godentist.ts` confirms the time guard
    - `npx tsc --noEmit` passes
  </verify>
  <done>sendConfirmations fires godentist/followup.check Inngest event after saving history, with 2pm time guard</done>
</task>

<task type="auto">
  <name>Task 2: Add followup fields to ScrapeHistoryEntry type and getScrapeHistory</name>
  <files>src/app/actions/godentist.ts</files>
  <action>
1. Add fields to `ScrapeHistoryEntry` interface (line ~88-97):
```typescript
export interface ScrapeHistoryEntry {
  id: string
  scraped_date: string
  sucursales: string[]
  appointments: GodentistAppointment[]
  total_appointments: number
  send_results: SendResult | null
  sent_at: string | null
  followup_results: FollowupResult[] | null   // NEW
  followup_sent_at: string | null              // NEW
  created_at: string
}
```

2. Add `FollowupResult` type near `SendResult`:
```typescript
export interface FollowupResult {
  nombre: string
  telefono: string
  status: 'sent' | 'skipped' | 'failed'
  reason?: string
}
```

3. Update `getScrapeHistory` function to include the new fields in the mapping (line ~343-353). Add to the `.map(row => ...)`:
```typescript
followup_results: (row.followup_results as unknown as FollowupResult[]) || null,
followup_sent_at: row.followup_sent_at,
```
  </action>
  <verify>
    - `grep "followup_results" src/app/actions/godentist.ts` finds type + mapping
    - `grep "FollowupResult" src/app/actions/godentist.ts` finds the interface
    - `npx tsc --noEmit` passes
  </verify>
  <done>ScrapeHistoryEntry includes followup fields, getScrapeHistory returns them</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes
- sendConfirmations fires followup event only when sent > 0 and before 2pm Colombia
- ScrapeHistoryEntry type includes followup_results and followup_sent_at
- getScrapeHistory maps the new fields from DB
</verification>

<success_criteria>
- Followup event is fired after confirmations with correct historyId, workspaceId, scheduledAt
- Time guard prevents scheduling if sent after 2pm
- History entries include followup data for UI consumption
</success_criteria>

<output>
After completion, create `.planning/standalone/godentist-followup-ultimatum/02-SUMMARY.md`
</output>
