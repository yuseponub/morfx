---
phase: standalone/godentist-scraping-general
plan: 02
type: execute
wave: 2
depends_on: ["01"]
files_modified:
  - src/app/actions/godentist.ts
autonomous: true

must_haves:
  truths:
    - "Host can schedule reminders for scraped appointments and see confirmation counts"
    - "Host can list all scheduled reminders for the workspace"
    - "Host can cancel a pending reminder before it fires"
  artifacts:
    - path: "src/app/actions/godentist.ts"
      provides: "scheduleReminders, getScheduledReminders, cancelScheduledReminder server actions"
      exports: ["scheduleReminders", "getScheduledReminders", "cancelScheduledReminder"]
  key_links:
    - from: "src/app/actions/godentist.ts"
      to: "src/inngest/client.ts"
      via: "inngest.send for godentist/reminder.send event"
      pattern: "inngest\\.send.*godentist/reminder"
    - from: "src/app/actions/godentist.ts"
      to: "supabase godentist_scheduled_reminders table"
      via: "createAdminClient insert/select/update"
      pattern: "godentist_scheduled_reminders"
---

<objective>
Create all server actions for GoDentist reminder scheduling: schedule reminders with timezone-aware send-time calculation, list reminders, and cancel pending reminders.

Purpose: Wire the Inngest function (Plan 01) to the UI (Plan 03) through server actions that handle timezone math, validation, and DB operations.
Output: Three server actions ready for UI consumption, plus targetDate passthrough in scrapeAppointments.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/godentist-scraping-general/CONTEXT.md
@.planning/standalone/godentist-scraping-general/01-SUMMARY.md
@src/app/actions/godentist.ts
@src/inngest/client.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Server actions for reminder scheduling, listing, and cancellation</name>
  <files>src/app/actions/godentist.ts</files>
  <action>
    Modify `src/app/actions/godentist.ts` to add three new server actions and update one existing one.

    **1. Modify `scrapeAppointments`** to accept optional `targetDate`:
    - Change signature: `scrapeAppointments(sucursales?: string[], targetDate?: string)`
    - Pass `targetDate` in the fetch body to robot:
      ```typescript
      body: JSON.stringify({
        workspaceId,
        credentials: { username: 'JROMERO', password: '123456' },
        ...(sucursales?.length ? { sucursales } : {}),
        ...(targetDate ? { targetDate } : {}),
      }),
      ```

    **2. Add hora parsing helpers** (file-level, not exported):
    ```typescript
    function parseHora(hora: string): { hours: number; minutes: number } {
      // Handle "8:00 AM", "2:30 PM", "14:30" formats
      const match = hora.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
      if (!match) return { hours: 8, minutes: 0 }  // fallback
      let hours = parseInt(match[1], 10)
      const minutes = parseInt(match[2], 10)
      const period = match[3]?.toUpperCase()
      if (period === 'PM' && hours < 12) hours += 12
      if (period === 'AM' && hours === 12) hours = 0
      return { hours, minutes }
    }

    function calculateScheduledAt(fechaCita: string, hora: string): Date {
      const { hours, minutes } = parseHora(hora)
      // fechaCita is YYYY-MM-DD, hora is appointment time in Colombia
      const [y, m, d] = fechaCita.split('-').map(Number)
      // Colombia is UTC-5: add 5 hours to get UTC equivalent
      const citaUtc = new Date(Date.UTC(y, m - 1, d, hours + 5, minutes))
      // Subtract 1 hour for reminder (send 1h before appointment)
      const reminderUtc = new Date(citaUtc.getTime() - 60 * 60 * 1000)
      return reminderUtc
    }
    ```

    **3. Add `scheduleReminders` server action:**
    ```typescript
    export interface ScheduleResult {
      total: number
      scheduled: number
      skipped: number
      details: Array<{
        nombre: string
        telefono: string
        status: 'scheduled' | 'skipped'
        reason?: string
        scheduledAt?: string
      }>
    }

    export async function scheduleReminders(
      appointments: GodentistAppointment[],
      fechaCita: string,  // YYYY-MM-DD
      historyId?: string
    ): Promise<{ error?: string; data?: ScheduleResult }>
    ```
    - Auth + workspace check (same pattern as sendConfirmations)
    - Import `inngest` from `@/inngest/client`
    - For each appointment:
      - Calculate `scheduledAt` using `calculateScheduledAt(fechaCita, apt.hora)`
      - Validation: if `scheduledAt` < now + 15 minutes, skip with reason "Hora de envio ya paso o es muy pronto"
      - Insert into `godentist_scheduled_reminders` table
      - Send Inngest event `godentist/reminder.send` with all appointment data
      - Store the returned event ID (from inngest.send) if available, otherwise use reminder ID
    - Update inngest_event_id on the reminder row after sending
    - Return ScheduleResult with counts

    **4. Add `getScheduledReminders` server action:**
    ```typescript
    export interface ScheduledReminderEntry {
      id: string
      nombre: string
      telefono: string
      hora_cita: string
      sucursal: string
      fecha_cita: string
      scheduled_at: string
      status: string
      error: string | null
      sent_at: string | null
      created_at: string
    }

    export async function getScheduledReminders(): Promise<{ error?: string; data?: ScheduledReminderEntry[] }>
    ```
    - Auth + workspace check
    - Query `godentist_scheduled_reminders` WHERE workspace_id, ordered by scheduled_at DESC, limit 50
    - Return all fields

    **5. Add `cancelScheduledReminder` server action:**
    ```typescript
    export async function cancelScheduledReminder(reminderId: string): Promise<{ error?: string; success?: boolean }>
    ```
    - Auth + workspace check
    - Update status to 'cancelled' WHERE id = reminderId AND workspace_id AND status = 'pending'
    - Return success (the Inngest function checks status before sending, so marking cancelled is sufficient)

    **IMPORTANT:** Use `await (inngest as any).send(...)` pattern for type assertion (established pattern in this codebase for custom event types).
  </action>
  <verify>
    - `npx tsc --noEmit` passes
    - All new server actions are exported from godentist.ts
    - New ScheduledReminderEntry and ScheduleResult types are exported
    - grep confirms: scheduleReminders, getScheduledReminders, cancelScheduledReminder all exported
  </verify>
  <done>
    Server actions scheduleReminders, getScheduledReminders, cancelScheduledReminder all work with proper auth/workspace checks.
    scrapeAppointments passes optional targetDate to robot.
    Timezone math correctly calculates send time as 1h before appointment in Colombia time.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes
2. All server actions exported and follow auth/workspace pattern
3. calculateScheduledAt correctly converts Colombia time to UTC
</verification>

<success_criteria>
- scheduleReminders calculates correct send time (1h before appointment, Colombia TZ)
- Appointments too close to now (< 15min) are skipped with explanation
- cancelScheduledReminder marks as cancelled (Inngest function skips cancelled)
- getScheduledReminders returns list for workspace ordered by scheduled_at DESC
</success_criteria>

<output>
After completion, create `.planning/standalone/godentist-scraping-general/02-SUMMARY.md`
</output>
