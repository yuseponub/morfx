---
phase: standalone/godentist-scraping-general
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - godentist/robot-godentist/src/types/index.ts
  - godentist/robot-godentist/src/adapters/godentist-adapter.ts
  - godentist/robot-godentist/src/api/server.ts
  - supabase/migrations/20260312100000_godentist_scheduled_reminders.sql
  - src/inngest/events.ts
  - src/inngest/functions/godentist-reminders.ts
  - src/app/api/inngest/route.ts
  - src/app/actions/godentist.ts
autonomous: true

must_haves:
  truths:
    - "Robot accepts optional targetDate and scrapes that date instead of auto-calculated next working day"
    - "Scheduled reminders are persisted in DB with correct scheduled_at timestamps"
    - "Inngest function sleeps until scheduled_at then sends WhatsApp template"
    - "Cancelled reminders are not sent (status checked before send)"
    - "Server actions exist for scheduling, listing, and cancelling reminders"
  artifacts:
    - path: "godentist/robot-godentist/src/types/index.ts"
      provides: "targetDate field in ScrapeAppointmentsRequest"
      contains: "targetDate"
    - path: "godentist/robot-godentist/src/adapters/godentist-adapter.ts"
      provides: "scrapeAppointments accepts optional targetDate param"
      contains: "targetDate"
    - path: "supabase/migrations/20260312100000_godentist_scheduled_reminders.sql"
      provides: "godentist_scheduled_reminders table"
      contains: "CREATE TABLE godentist_scheduled_reminders"
    - path: "src/inngest/functions/godentist-reminders.ts"
      provides: "Inngest function that sleeps until scheduled_at and sends template"
      contains: "sleepUntil"
    - path: "src/app/actions/godentist.ts"
      provides: "scheduleReminders, getScheduledReminders, cancelScheduledReminder server actions"
      contains: "scheduleReminders"
  key_links:
    - from: "src/app/actions/godentist.ts"
      to: "src/inngest/client.ts"
      via: "inngest.send for godentist/reminder.send event"
      pattern: "inngest\\.send.*godentist/reminder"
    - from: "src/inngest/functions/godentist-reminders.ts"
      to: "src/lib/domain/messages"
      via: "sendTemplateMessage for WhatsApp delivery"
      pattern: "sendTemplateMessage"
    - from: "src/app/api/inngest/route.ts"
      to: "src/inngest/functions/godentist-reminders.ts"
      via: "godentistReminderFunctions in serve()"
      pattern: "godentistReminderFunctions"
---

<objective>
Build the complete backend for GoDentist scraping general: robot targetDate support, DB migration for scheduled reminders, Inngest reminder function, and all server actions.

Purpose: Enable date-flexible scraping and automated reminder scheduling so the host can scrape any date and program WhatsApp reminders 1h before each appointment.
Output: Robot accepts targetDate, new DB table exists, Inngest function sends reminders at scheduled time, server actions ready for UI consumption.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/godentist-scraping-general/CONTEXT.md
@godentist/robot-godentist/src/types/index.ts
@godentist/robot-godentist/src/adapters/godentist-adapter.ts
@godentist/robot-godentist/src/api/server.ts
@src/inngest/events.ts
@src/inngest/client.ts
@src/app/api/inngest/route.ts
@src/inngest/functions/agent-timers.ts
@src/app/actions/godentist.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Robot targetDate + DB migration + Inngest event type</name>
  <files>
    godentist/robot-godentist/src/types/index.ts
    godentist/robot-godentist/src/adapters/godentist-adapter.ts
    godentist/robot-godentist/src/api/server.ts
    supabase/migrations/20260312100000_godentist_scheduled_reminders.sql
    src/inngest/events.ts
  </files>
  <action>
    **1. Robot types** (`godentist/robot-godentist/src/types/index.ts`):
    - Add `targetDate?: string` (YYYY-MM-DD format) to `ScrapeAppointmentsRequest`

    **2. Robot adapter** (`godentist/robot-godentist/src/adapters/godentist-adapter.ts`):
    - Change `scrapeAppointments(filterSucursales?: string[])` signature to `scrapeAppointments(filterSucursales?: string[], targetDate?: string)`
    - At line ~168, instead of always calling `this.getNextWorkingDay()`, check if `targetDate` is provided:
      ```typescript
      let target: Date
      if (targetDate) {
        // Parse YYYY-MM-DD into Date object
        const [y, m, d] = targetDate.split('-').map(Number)
        target = new Date(y, m - 1, d)
      } else {
        target = this.getNextWorkingDay()
      }
      const dateStr = this.formatDateDD_MM_YYYY(target)
      const dateLabel = this.formatDateYYYY_MM_DD(target)
      ```

    **3. Robot server** (`godentist/robot-godentist/src/api/server.ts`):
    - In the `/api/scrape-appointments` handler, pass `body.targetDate` to `adapter.scrapeAppointments()`:
      ```typescript
      const result = await adapter.scrapeAppointments(body.sucursales, body.targetDate)
      ```
    - Add `targetDate` to the `ScrapeAppointmentsRequest` type import (already in types)

    **4. DB migration** (`supabase/migrations/20260312100000_godentist_scheduled_reminders.sql`):
    ```sql
    -- GoDentist Scheduled Reminders
    -- Stores programmed WhatsApp reminder sends for appointments
    CREATE TABLE IF NOT EXISTS godentist_scheduled_reminders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      scrape_history_id UUID REFERENCES godentist_scrape_history(id) ON DELETE SET NULL,
      -- Appointment data
      nombre TEXT NOT NULL,
      telefono TEXT NOT NULL,
      hora_cita TEXT NOT NULL,
      sucursal TEXT NOT NULL,
      fecha_cita TEXT NOT NULL,
      -- Scheduling
      scheduled_at TIMESTAMPTZ NOT NULL,
      inngest_event_id TEXT,
      -- Status
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
      error TEXT,
      -- Timestamps
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW())
    );

    -- Index for listing pending reminders by workspace
    CREATE INDEX IF NOT EXISTS idx_godentist_reminders_workspace_status
      ON godentist_scheduled_reminders(workspace_id, status)
      WHERE status = 'pending';

    -- Index for Inngest function lookup by event ID
    CREATE INDEX IF NOT EXISTS idx_godentist_reminders_inngest_event
      ON godentist_scheduled_reminders(inngest_event_id)
      WHERE inngest_event_id IS NOT NULL;
    ```

    **5. Inngest events** (`src/inngest/events.ts`):
    - Add a new `GodentistEvents` type BEFORE the `AllAgentEvents` union:
      ```typescript
      // ============================================================================
      // GoDentist Events (Standalone: Scraping General)
      // ============================================================================
      export type GodentistEvents = {
        'godentist/reminder.send': {
          data: {
            reminderId: string
            workspaceId: string
            nombre: string
            telefono: string
            horaCita: string
            sucursal: string
            fechaCita: string
            scheduledAt: string  // ISO timestamp
          }
        }
      }
      ```
    - Update `AllAgentEvents` to include `GodentistEvents`:
      ```typescript
      export type AllAgentEvents = AgentEvents & IngestEvents & AutomationEvents & RobotEvents & GodentistEvents
      ```
  </action>
  <verify>
    - `cd godentist/robot-godentist && npx tsc --noEmit` passes
    - `npx tsc --noEmit` passes in main project
    - Migration SQL file exists with correct table definition
  </verify>
  <done>
    Robot adapter accepts optional targetDate parameter and uses it when provided (falls back to getNextWorkingDay).
    DB migration creates godentist_scheduled_reminders table with all required columns.
    Inngest event type godentist/reminder.send is registered.
  </done>
</task>

<task type="auto">
  <name>Task 2: Inngest reminder function + server actions</name>
  <files>
    src/inngest/functions/godentist-reminders.ts
    src/app/api/inngest/route.ts
    src/app/actions/godentist.ts
  </files>
  <action>
    **1. Inngest function** (`src/inngest/functions/godentist-reminders.ts`):
    Create new file. Follow pattern from agent-timers.ts but use `step.sleepUntil()`:

    ```typescript
    import { inngest } from '../client'
    import { createAdminClient } from '@/lib/supabase/admin'
    import { sendTemplateMessage } from '@/lib/domain/messages'
    import { findOrCreateConversation, linkContactToConversation } from '@/lib/domain/conversations'
    import { createContact } from '@/lib/domain/contacts'
    import { assignTag } from '@/lib/domain/tags'

    const TEMPLATE_NAME = 'recordatorio_cita_godentist'

    const SUCURSAL_ADDRESSES: Record<string, string> = {
      'CABECERA': 'Calle 52 # 31-32 Edificio Elsita Piso 1',
      'JUMBO EL BOSQUE': 'Autopista Floridablanca # 24-26; CC Jumbo El Bosque, Floridablanca; Local 2030',
      'FLORIDABLANCA': 'Calle 4 # 3-06 Edificio Florida Plaza Condominio Local 1',
      'MEJORAS PUBLICAS': 'Calle 41 # 27-63 Edificio O41 Centro Empresarial Oficina 1002',
    }

    const SUCURSAL_TAGS: Record<string, string> = {
      'CABECERA': 'CAB',
      'FLORIDABLANCA': 'FLO',
      'JUMBO EL BOSQUE': 'JUM',
      'MEJORAS PUBLICAS': 'MEJ',
    }

    function toTitleCase(str: string): string {
      return str.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    }

    function formatDateSpanish(dateStr: string): string {
      const [year, month, day] = dateStr.split('-').map(Number)
      const date = new Date(year, month - 1, day)
      const days = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']
      const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
      return `${days[date.getDay()]} ${day} de ${months[date.getMonth()]}`
    }
    ```

    The function:
    ```typescript
    const godentistReminderSend = inngest.createFunction(
      {
        id: 'godentist-reminder-send',
        name: 'GoDentist: Send Scheduled Reminder',
      },
      { event: 'godentist/reminder.send' },
      async ({ event, step }) => {
        const { reminderId, workspaceId, nombre, telefono, horaCita, sucursal, fechaCita, scheduledAt } = event.data

        // Step 1: Sleep until scheduled time
        await step.sleepUntil('wait-until-send-time', new Date(scheduledAt))

        // Step 2: Check if still pending (may have been cancelled)
        const shouldSend = await step.run('check-status', async () => {
          const admin = createAdminClient()
          const { data } = await admin
            .from('godentist_scheduled_reminders')
            .select('status')
            .eq('id', reminderId)
            .single()
          return data?.status === 'pending'
        })

        if (!shouldSend) {
          return { skipped: true, reason: 'cancelled or already sent' }
        }

        // Step 3: Send the template
        const sendResult = await step.run('send-template', async () => {
          const admin = createAdminClient()
          const domainCtx = { workspaceId, source: 'inngest-godentist' }
          const phone = telefono.startsWith('+') ? telefono : `+${telefono}`
          const nombreTitleCase = toTitleCase(nombre)
          const sucursalTitleCase = toTitleCase(sucursal)
          const address = SUCURSAL_ADDRESSES[sucursal.toUpperCase()] || sucursal
          const fechaFormateada = formatDateSpanish(fechaCita)
          const tagName = SUCURSAL_TAGS[sucursal.toUpperCase()]

          // Find or create contact
          let contactId: string | null = null
          const createResult = await createContact(domainCtx, {
            name: nombreTitleCase,
            phone,
            tags: tagName ? [tagName] : undefined,
          })
          if (createResult.success && createResult.data) {
            contactId = createResult.data.contactId
          } else if (createResult.error?.includes('Ya existe')) {
            const { data: existing } = await admin
              .from('contacts')
              .select('id')
              .eq('workspace_id', workspaceId)
              .eq('phone', phone)
              .single()
            contactId = existing?.id || null
          }

          // Find or create conversation
          const convResult = await findOrCreateConversation(domainCtx, {
            phone,
            profileName: nombreTitleCase,
            contactId: contactId || undefined,
          })

          if (!convResult.success || !convResult.data) {
            throw new Error(`Failed to create conversation: ${convResult.error}`)
          }

          const conversationId = convResult.data.conversationId

          // Link contact if needed
          if (contactId && !convResult.data.created) {
            await linkContactToConversation(domainCtx, { conversationId, contactId }).catch(() => {})
          }

          // Assign tag
          if (tagName && contactId) {
            await assignTag(domainCtx, { entityType: 'contact', entityId: contactId, tagName }).catch(() => {})
          }

          // Get workspace API key
          const { data: wsData } = await admin
            .from('workspaces')
            .select('settings')
            .eq('id', workspaceId)
            .single()
          const apiKey = wsData?.settings?.whatsapp_api_key || process.env.WHATSAPP_API_KEY
          if (!apiKey) throw new Error('WhatsApp API key not configured')

          const renderedText = `¡Hola, ${nombreTitleCase}! Te recordamos tu cita en godentist ${sucursalTitleCase} hoy ${fechaFormateada} a las ${horaCita}. Direccion: ${address}. Te esperamos!`

          const result = await sendTemplateMessage(domainCtx, {
            conversationId,
            contactPhone: phone,
            templateName: TEMPLATE_NAME,
            templateLanguage: 'es',
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: nombreTitleCase },
                  { type: 'text', text: sucursalTitleCase },
                  { type: 'text', text: fechaFormateada },
                  { type: 'text', text: horaCita },
                  { type: 'text', text: address },
                ],
              },
            ],
            renderedText,
            apiKey,
          })

          return result
        })

        // Step 4: Update DB status
        await step.run('update-status', async () => {
          const admin = createAdminClient()
          if (sendResult.success) {
            await admin
              .from('godentist_scheduled_reminders')
              .update({ status: 'sent', sent_at: new Date().toISOString() })
              .eq('id', reminderId)
          } else {
            await admin
              .from('godentist_scheduled_reminders')
              .update({ status: 'failed', error: sendResult.error || 'Unknown error' })
              .eq('id', reminderId)
          }
        })

        return { sent: sendResult.success, reminderId }
      }
    )

    export const godentistReminderFunctions = [godentistReminderSend]
    ```

    **2. Register in Inngest route** (`src/app/api/inngest/route.ts`):
    - Import `godentistReminderFunctions` from `@/inngest/functions/godentist-reminders`
    - Add `...godentistReminderFunctions` to the `functions` array in `serve()`

    **3. Server actions** (`src/app/actions/godentist.ts`):

    **3a. Modify `scrapeAppointments`** to accept optional `targetDate`:
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

    **3b. Add `scheduleReminders` server action:**
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
    ): Promise<{ error?: string; data?: ScheduleResult }> {
    ```
    - Auth + workspace check (same pattern as sendConfirmations)
    - Import `inngest` from `@/inngest/client`
    - For each appointment:
      - Parse `apt.hora` (format like "8:00 AM" or "14:30") into hours/minutes
      - Calculate `scheduledAt` = fechaCita at (hora_cita - 1 hour) in America/Bogota timezone
      - Validation: if `scheduledAt` < now + 15 minutes, skip with reason "Hora de envio ya paso o es muy pronto"
      - Insert into `godentist_scheduled_reminders` table
      - Send Inngest event `godentist/reminder.send` with all appointment data
      - Store the returned event ID (from inngest.send) if available, otherwise use reminder ID
    - Update inngest_event_id on the reminder row after sending
    - Return ScheduleResult with counts

    **Important for hora parsing:** The appointment hora from GoDentist portal comes as "8:00 AM", "2:30 PM" etc. Parse carefully:
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
      // Create date in Colombia timezone
      // fechaCita is YYYY-MM-DD
      const [y, m, d] = fechaCita.split('-').map(Number)
      // Build ISO string for Colombia time, then subtract 1 hour
      // Colombia is UTC-5, so we add 5 hours to get UTC
      const citaUtc = new Date(Date.UTC(y, m - 1, d, hours + 5, minutes))
      // Subtract 1 hour for reminder
      const reminderUtc = new Date(citaUtc.getTime() - 60 * 60 * 1000)
      return reminderUtc
    }
    ```

    **3c. Add `getScheduledReminders` server action:**
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

    **3d. Add `cancelScheduledReminder` server action:**
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
    - Inngest function is registered in route.ts
    - New ScheduledReminderEntry and ScheduleResult types are exported
  </verify>
  <done>
    Inngest godentist-reminder-send function uses step.sleepUntil then sends template (checking cancelled status first).
    Server actions scheduleReminders, getScheduledReminders, cancelScheduledReminder all work with proper auth/workspace checks.
    scrapeAppointments passes optional targetDate to robot.
    Inngest route serves the new function.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes in both main project and robot-godentist
2. All new types and server actions are properly exported
3. Inngest function registered in serve() route
4. Migration SQL is valid and creates the correct table
</verification>

<success_criteria>
- Robot scrapeAppointments accepts targetDate param (YYYY-MM-DD)
- godentist_scheduled_reminders table migration ready to apply
- Inngest function sleeps until scheduled_at, checks status, sends template
- scheduleReminders calculates correct send time (1h before appointment, Colombia TZ)
- cancelScheduledReminder marks as cancelled (Inngest function skips cancelled)
- getScheduledReminders returns list for workspace
</success_criteria>

<output>
After completion, create `.planning/standalone/godentist-scraping-general/01-SUMMARY.md`
</output>
