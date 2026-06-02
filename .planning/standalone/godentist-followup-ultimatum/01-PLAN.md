---
phase: godentist-followup-ultimatum
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/20260316_godentist_followup_columns.sql
  - src/inngest/events.ts
  - src/inngest/functions/godentist-reminders.ts
  - src/app/api/inngest/route.ts
autonomous: true

must_haves:
  truths:
    - "At 2pm Colombia time, patients who haven't responded get conservacion_cita template"
    - "Patients who responded after confirmation are skipped"
    - "Cancelled appointments are never followed up"
    - "Followup results are persisted in godentist_scrape_history"
  artifacts:
    - path: "supabase/migrations/20260316_godentist_followup_columns.sql"
      provides: "followup_results and followup_sent_at columns"
      contains: "followup_results"
    - path: "src/inngest/functions/godentist-reminders.ts"
      provides: "godentistFollowupCheck Inngest function"
      exports: ["godentistReminderFunctions"]
    - path: "src/inngest/events.ts"
      provides: "godentist/followup.check event type"
      contains: "godentist/followup.check"
  key_links:
    - from: "src/inngest/functions/godentist-reminders.ts"
      to: "godentist_scrape_history"
      via: "reads send_results to find patients with status=sent"
      pattern: "send_results.*details.*status.*sent"
    - from: "src/inngest/functions/godentist-reminders.ts"
      to: "src/lib/domain/messages.ts"
      via: "sendTemplateMessage for conservacion_cita"
      pattern: "sendTemplateMessage.*conservacion_cita"
---

<objective>
Create the Inngest followup function, event type, and DB migration for the GoDentist 2pm ultimatum system.

Purpose: When confirmations are sent in the morning, patients who don't respond by 2pm should receive a `conservacion_cita` WhatsApp template as a last-chance reminder.
Output: Migration SQL file, Inngest event type, Inngest function that checks responses and sends ultimatums.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/inngest/functions/godentist-reminders.ts
@src/inngest/events.ts
@src/app/api/inngest/route.ts
@src/app/actions/godentist.ts
@src/lib/domain/messages.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Migration + Event Type</name>
  <files>
    supabase/migrations/20260316_godentist_followup_columns.sql
    src/inngest/events.ts
  </files>
  <action>
1. Create migration file `supabase/migrations/20260316_godentist_followup_columns.sql`:
```sql
ALTER TABLE godentist_scrape_history
  ADD COLUMN IF NOT EXISTS followup_results JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS followup_sent_at TIMESTAMPTZ DEFAULT NULL;
```

2. Add event to `GodentistEvents` in `src/inngest/events.ts`:
```typescript
'godentist/followup.check': {
  data: {
    historyId: string
    workspaceId: string
    /** ISO timestamp of when to run the check (2pm Colombia = 19:00 UTC) */
    scheduledAt: string
  }
}
```

IMPORTANT: Place the new event inside the existing `GodentistEvents` type block, after the `godentist/tag.remove_scheduled` event. Do NOT create a new type — extend the existing one.

PAUSE after creating migration — inform user they need to apply it in production before deploying code.
  </action>
  <verify>
    - Migration file exists at `supabase/migrations/20260316_godentist_followup_columns.sql`
    - `grep "godentist/followup.check" src/inngest/events.ts` finds the event
    - `npx tsc --noEmit` passes (no type errors)
  </verify>
  <done>Migration file ready, event type defined in GodentistEvents</done>
</task>

<task type="auto">
  <name>Task 2: Inngest Followup Function</name>
  <files>
    src/inngest/functions/godentist-reminders.ts
    src/app/api/inngest/route.ts
  </files>
  <action>
Add a new Inngest function `godentistFollowupCheck` to `src/inngest/functions/godentist-reminders.ts`. Follow the exact same pattern as `godentistReminderSend` (sleepUntil, step.run blocks, createAdminClient, DomainContext).

Function logic:

```
godentistFollowupCheck = inngest.createFunction(
  { id: 'godentist-followup-check', name: 'GoDentist: 2PM Followup Check', retries: 2 },
  { event: 'godentist/followup.check' },
  async ({ event, step }) => {
    const { historyId, workspaceId, scheduledAt } = event.data

    // Step 1: Sleep until 2pm
    await step.sleepUntil('wait-until-2pm', new Date(scheduledAt))

    // Step 2: Load history entry and get patients with status='sent'
    const patients = await step.run('load-sent-patients', async () => {
      const admin = createAdminClient()
      const { data } = await admin
        .from('godentist_scrape_history')
        .select('send_results, scraped_date')
        .eq('id', historyId)
        .single()

      if (!data?.send_results) return []

      const sendResults = data.send_results as unknown as SendResult
      // Only patients with status='sent' (skip excluded/failed)
      return sendResults.details
        .filter(d => d.status === 'sent')
        .map(d => ({
          nombre: d.nombre,
          telefono: d.telefono,
          scrapedDate: data.scraped_date,
        }))
    })

    if (!patients || patients.length === 0) {
      return { skipped: true, reason: 'no sent patients found' }
    }

    // Step 3: Check each patient for inbound messages and send ultimatum if no response
    const followupResults = await step.run('check-and-send-ultimatums', async () => {
      const admin = createAdminClient()
      const domainCtx: DomainContext = { workspaceId, source: 'inngest-godentist' }
      const results: Array<{
        nombre: string
        telefono: string
        status: 'sent' | 'skipped' | 'failed'
        reason?: string
      }> = []

      // Get workspace API key
      const { data: wsData } = await admin
        .from('workspaces')
        .select('settings')
        .eq('id', workspaceId)
        .single()
      const settings = wsData?.settings as any
      const apiKey = settings?.whatsapp_api_key || process.env.WHATSAPP_API_KEY
      if (!apiKey) throw new Error('WhatsApp API key not configured')

      for (const patient of patients) {
        const phone = patient.telefono.startsWith('+') ? patient.telefono : `+${patient.telefono}`

        // Find conversation by phone
        const { data: conv } = await admin
          .from('conversations')
          .select('id')
          .eq('workspace_id', workspaceId)
          .eq('phone', phone)
          .single()

        if (!conv) {
          results.push({ nombre: patient.nombre, telefono: patient.telefono, status: 'failed', reason: 'no conversation found' })
          continue
        }

        // Check for inbound messages after the history was created (confirmation sent_at)
        // Look for messages with direction='inbound' in this conversation after sent_at
        const { data: history } = await admin
          .from('godentist_scrape_history')
          .select('sent_at')
          .eq('id', historyId)
          .single()

        const sentAt = history?.sent_at
        if (!sentAt) {
          results.push({ nombre: patient.nombre, telefono: patient.telefono, status: 'failed', reason: 'no sent_at timestamp' })
          continue
        }

        const { data: inboundMessages } = await admin
          .from('messages')
          .select('id')
          .eq('conversation_id', conv.id)
          .eq('direction', 'inbound')
          .gt('created_at', sentAt)
          .limit(1)

        if (inboundMessages && inboundMessages.length > 0) {
          // Patient responded — skip
          results.push({ nombre: patient.nombre, telefono: patient.telefono, status: 'skipped', reason: 'patient responded' })
          continue
        }

        // No response — send conservacion_cita template
        // Template has 2 body vars: {{1}}=nombre (Title Case), {{2}}="MARTES 17 de marzo a las 2:30 PM"
        const nombreTC = toTitleCase(patient.nombre)

        // Build date+time string: "MARTES 17 de marzo a las 2:30 PM"
        // Parse scraped_date (YYYY-MM-DD) and find appointment time from original data
        // We need hora from original appointments — but we only have nombre+telefono
        // Re-fetch from history to get full appointment data
        const { data: fullHistory } = await admin
          .from('godentist_scrape_history')
          .select('appointments')
          .eq('id', historyId)
          .single()

        const appointments = (fullHistory?.appointments as unknown as Array<{ nombre: string; telefono: string; hora: string; sucursal: string; estado: string }>) || []
        const matchedApt = appointments.find(a => a.telefono === patient.telefono)

        if (!matchedApt) {
          results.push({ nombre: patient.nombre, telefono: patient.telefono, status: 'failed', reason: 'appointment not found in history' })
          continue
        }

        // Skip cancelled appointments
        if (matchedApt.estado.toLowerCase().includes('cancelada')) {
          results.push({ nombre: patient.nombre, telefono: patient.telefono, status: 'skipped', reason: 'cancelled appointment' })
          continue
        }

        // Format: "MARTES 17 de marzo a las 2:30 PM"
        const dayUpper = formatDateSpanish(patient.scrapedDate).split(' ')[0].toUpperCase()
        const dateParts = formatDateSpanish(patient.scrapedDate) // "martes 17 de marzo"
        const dateFormatted = dayUpper + dateParts.substring(dateParts.indexOf(' ')) + ' a las ' + matchedApt.hora

        try {
          const sendResult = await sendTemplateMessage(domainCtx, {
            conversationId: conv.id,
            contactPhone: phone,
            templateName: 'conservacion_cita',
            templateLanguage: 'es',
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: nombreTC },
                  { type: 'text', text: dateFormatted },
                ],
              },
            ],
            renderedText: `Conservacion cita: ${nombreTC} - ${dateFormatted}`,
            apiKey,
          })

          if (sendResult.success) {
            results.push({ nombre: patient.nombre, telefono: patient.telefono, status: 'sent' })
          } else {
            results.push({ nombre: patient.nombre, telefono: patient.telefono, status: 'failed', reason: sendResult.error || 'send failed' })
          }
        } catch (err) {
          results.push({ nombre: patient.nombre, telefono: patient.telefono, status: 'failed', reason: err instanceof Error ? err.message : String(err) })
        }

        // Rate limit
        await new Promise(r => setTimeout(r, 500))
      }

      return results
    })

    // Step 4: Save followup results to history
    await step.run('save-followup-results', async () => {
      const admin = createAdminClient()
      await admin
        .from('godentist_scrape_history')
        .update({
          followup_results: followupResults as unknown as Record<string, unknown>,
          followup_sent_at: new Date().toISOString(),
        })
        .eq('id', historyId)
    })

    const sent = followupResults.filter(r => r.status === 'sent').length
    const skipped = followupResults.filter(r => r.status === 'skipped').length
    const failed = followupResults.filter(r => r.status === 'failed').length

    return { historyId, sent, skipped, failed, total: followupResults.length }
  }
)
```

IMPORTANT implementation details:
- Import `SendResult` type at the top of the file (it's in godentist.ts but since it's an action file, define a local copy or import from a shared location). ACTUALLY: Define a local `SendResultDetails` interface matching the shape `{ total, sent, failed, excluded, details: Array<{ nombre, telefono, status, error? }> }` — do NOT import from the server action file.
- The `toTitleCase` and `formatDateSpanish` helpers already exist in this file — reuse them.
- Add `godentistFollowupCheck` to the exported `godentistReminderFunctions` array.
- The serve route (`src/app/api/inngest/route.ts`) already spreads `godentistReminderFunctions` — no changes needed there since the new function is added to the same array.

OPTIMIZATION: The `sent_at` and `appointments` queries inside the loop are for the same historyId — fetch them ONCE before the loop, not per-patient. Move the history lookups (sent_at, appointments) outside the for loop.
  </action>
  <verify>
    - `grep "godentist-followup-check" src/inngest/functions/godentist-reminders.ts` finds the function
    - `grep "godentistFollowupCheck" src/inngest/functions/godentist-reminders.ts` confirms it's in the exports array
    - `npx tsc --noEmit` passes
  </verify>
  <done>Inngest function checks patient responses at 2pm and sends conservacion_cita to non-responders. Function is registered in the serve route via the existing array export.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with no errors
- Migration file exists and has correct ALTER TABLE statements
- Event type `godentist/followup.check` is in GodentistEvents
- Inngest function `godentist-followup-check` is created and exported
- Function uses sleepUntil, checks inbound messages, sends template, saves results
</verification>

<success_criteria>
- Inngest function correctly sleeps until 2pm, loads patients with status='sent', checks for inbound messages, sends conservacion_cita to non-responders, and saves results to followup_results JSONB column
- No type errors in the codebase
</success_criteria>

<output>
After completion, create `.planning/standalone/godentist-followup-ultimatum/01-SUMMARY.md`
</output>
