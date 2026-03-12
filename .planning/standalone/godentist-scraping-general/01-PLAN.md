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
autonomous: false

must_haves:
  truths:
    - "Host can scrape appointments for any chosen date, not just the next working day"
    - "Reminders table exists in production before any code references it"
    - "Inngest function wakes at the right time and delivers WhatsApp reminder"
    - "If a reminder is cancelled before send time, no message is sent"
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
  key_links:
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
Build the backend foundation for GoDentist scraping general: robot targetDate support, DB migration for scheduled reminders, and the Inngest reminder function.

Purpose: Enable date-flexible scraping and the sleep-until-send Inngest function that powers automated WhatsApp reminders.
Output: Robot accepts targetDate, migration ready, Inngest function registered and ready.
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
</context>

<tasks>

<task type="auto">
  <name>Task 1: Robot targetDate support + DB migration + Inngest event type</name>
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

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>DB migration file for godentist_scheduled_reminders table</what-built>
  <how-to-verify>
    **Regla 5 compliance: migration must be applied BEFORE deploying code that references the table.**

    1. Apply the migration in production Supabase:
       - File: `supabase/migrations/20260312100000_godentist_scheduled_reminders.sql`
       - Go to Supabase Dashboard -> SQL Editor -> paste and run
    2. Verify the table `godentist_scheduled_reminders` exists with correct columns
    3. Verify both indexes were created
  </how-to-verify>
  <resume-signal>Type "applied" once migration is live in production, or describe issues</resume-signal>
</task>

<task type="auto">
  <name>Task 2: Inngest reminder function + route registration</name>
  <files>
    src/inngest/functions/godentist-reminders.ts
    src/app/api/inngest/route.ts
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

          const renderedText = `Hola, ${nombreTitleCase}! Te recordamos tu cita en godentist ${sucursalTitleCase} hoy ${fechaFormateada} a las ${horaCita}. Direccion: ${address}. Te esperamos!`

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
  </action>
  <verify>
    - `npx tsc --noEmit` passes
    - Inngest function is registered in route.ts (grep for godentistReminderFunctions)
  </verify>
  <done>
    Inngest godentist-reminder-send function uses step.sleepUntil then sends template (checking cancelled status first).
    Function registered in Inngest serve() route.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes in both main project and robot-godentist
2. All new types are properly exported
3. Inngest function registered in serve() route
4. Migration SQL is valid and creates the correct table
5. Migration applied in production BEFORE code deploy (checkpoint gate)
</verification>

<success_criteria>
- Robot scrapeAppointments accepts targetDate param (YYYY-MM-DD)
- godentist_scheduled_reminders table migration ready and applied
- Inngest function sleeps until scheduled_at, checks status, sends template
- Cancelled reminders are skipped by Inngest function
</success_criteria>

<output>
After completion, create `.planning/standalone/godentist-scraping-general/01-SUMMARY.md`
</output>
